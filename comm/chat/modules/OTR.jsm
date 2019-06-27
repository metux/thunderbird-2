/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { LocalizationSync } =
  ChromeUtils.import("resource://gre/modules/Localization.jsm", {});
const {BasePromiseWorker} = ChromeUtils.import("resource://gre/modules/PromiseWorker.jsm");
const {OS} = ChromeUtils.import("resource://gre/modules/osfile.jsm");
const {ctypes} = ChromeUtils.import("resource://gre/modules/ctypes.jsm");
const {Services} = ChromeUtils.import("resource:///modules/imServices.jsm");
const {CLib} = ChromeUtils.import("resource:///modules/CLib.jsm");
const {OTRLibLoader} = ChromeUtils.import("resource:///modules/OTRLib.jsm");
var workerPath = "chrome://chat/content/otrWorker.js";
const {OTRHelpers} = ChromeUtils.import("resource:///modules/OTRHelpers.jsm");

const syncL10n = new LocalizationSync([
  "messenger/otr/otr.ftl",
]);

function _str(id) {
  return syncL10n.formatValue(id);
}

function _strArgs(id, args) {
  return syncL10n.formatValue(id, args);
}

// some helpers

function setInterval(fn, delay) {
  let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  timer.init(fn, delay, Ci.nsITimer.TYPE_REPEATING_SLACK);
  return timer;
}

function clearInterval(timer) {
  timer.cancel();
}

// See: https://developer.mozilla.org/en-US/docs/Mozilla/js-ctypes/Using_js-ctypes/Working_with_data#Determining_if_two_pointers_are_equal
function comparePointers(p, q) {
  p = ctypes.cast(p, ctypes.uintptr_t).value.toString();
  q = ctypes.cast(q, ctypes.uintptr_t).value.toString();
  return p === q;
}

function trustFingerprint(fingerprint) {
  return (!fingerprint.isNull() &&
    !fingerprint.contents.trust.isNull() &&
    fingerprint.contents.trust.readString().length > 0);
}

// Report whether you think the given user is online. Return 1 if you think
// they are, 0 if you think they aren't, -1 if you're not sure.
function isOnline(conv) {
  let ret = -1;
  if (conv.buddy)
    ret = conv.buddy.online ? 1 : 0;
  return ret;
}

// OTRLib context wrapper

function Context(context) {
  this._context = context;
}

Context.prototype = {
  constructor: Context,
  get username() { return this._context.contents.username.readString(); },
  get account() { return this._context.contents.accountname.readString(); },
  get protocol() { return this._context.contents.protocol.readString(); },
  get msgstate() { return this._context.contents.msgstate; },
  get fingerprint() { return this._context.contents.active_fingerprint; },
  get trust() { return trustFingerprint(this.fingerprint); },
};


// otr module

var OTRLib;

var OTR = {

  hasRan: false,
  libLoaded: false,
  once() {
    this.hasRan = true;
    try {
      OTRLib = OTRLibLoader.init();
      if (!OTRLib) {
        return;
      }
      if (OTRLib && OTRLib.init()) {
        this.initUiOps();
        OTR.libLoaded = true;
      }
    } catch (e) {
      console.log(e);
    }
  },

  privateKeyPath: OTRHelpers.profilePath("otr.private_key"),
  fingerprintsPath: OTRHelpers.profilePath("otr.fingerprints"),
  instanceTagsPath: OTRHelpers.profilePath("otr.instance_tags"),

  init(opts) {
    opts = opts || {};

    if (!this.hasRan)
      this.once();

    if (!OTR.libLoaded)
      return;

    this.userstate = OTRLib.otrl_userstate_create();

    // A map of UIConvs, keyed on the target.id
    this._convos = new Map();
    this._observers = [];
    this._buffer = [];
    this._poll_timer = null;

    // Async sending may fail in the transport protocols, so periodically
    // drop old messages from the internal buffer. Should be rare.
    const pluck_time = 1 * 60 * 1000;
    this._pluck_timer = setInterval(() => {
      let buf = this._buffer;
      for (let i = 0; i < buf.length;) {
        if ((Date.now() - buf[i].time) > pluck_time) {
          this.log("dropping an old message: " + buf[i].display);
          buf.splice(i, 1);
        } else {
          i += 1;
        }
      }
    }, pluck_time);
  },

  close() {
    if (this._poll_timer) {
      clearInterval(this._poll_timer);
      this._poll_timer = null;
    }
    if (this._pluck_timer) {
      clearInterval(this._pluck_timer);
      this._pluck_timer = null;
    }
    this._buffer = null;
  },

  log(msg) {
    this.notifyObservers(msg, "otr:log");
  },

  // load stored files from my profile
  loadFiles() {
    return Promise.all([
      OS.File.exists(this.privateKeyPath).then((exists) => {
        if (exists && OTRLib.otrl_privkey_read(
          this.userstate, this.privateKeyPath
        )) throw new Error("Failed to read private keys.");
      }),
      OS.File.exists(this.fingerprintsPath).then((exists) => {
        if (exists && OTRLib.otrl_privkey_read_fingerprints(
          this.userstate, this.fingerprintsPath, null, null
        )) throw new Error("Failed to read fingerprints.");
      }),
      OS.File.exists(this.instanceTagsPath).then((exists) => {
        if (exists && OTRLib.otrl_instag_read(
          this.userstate, this.instanceTagsPath
        )) throw new Error("Failed to read instance tags.");
      }),
    ]);
  },

  // generate a private key in a worker
  generatePrivateKey(account, protocol) {
    let newkey = new ctypes.void_t.ptr();
    let err = OTRLib.otrl_privkey_generate_start(
      OTR.userstate, account, protocol, newkey.address()
    );
    if (err || newkey.isNull())
      return Promise.reject("otrl_privkey_generate_start (" + err + ")");

    let keyPtrSrc = newkey.toSource();
    let re = new RegExp(
      "^ctypes\\.voidptr_t\\(ctypes\\.UInt64\\(\"0x([0-9a-fA-F]+)\"\\)\\)$");
    let address;
    let match = re.exec(keyPtrSrc);
    if (match) {
      address = match[1];
    }

    if (!address) {
      OTRLib.otrl_privkey_generate_cancelled(OTR.userstate, newkey);
      throw new Error("generatePrivateKey failed to parse ptr.toSource(): " + keyPtrSrc);
    }

    let worker = new BasePromiseWorker(workerPath);
    return worker.post("generateKey", [
      OTRLib.path, OTRLib.otrl_version, address,
    ]).then(function() {
      let err = OTRLib.otrl_privkey_generate_finish(
        OTR.userstate, newkey, OTR.privateKeyPath
      );
      if (err)
        throw new Error("otrl_privkey_generate_calculate (" + err + ")");
    }).catch(function(err) {
      if (!newkey.isNull())
        OTRLib.otrl_privkey_generate_cancelled(OTR.userstate, newkey);
      throw err;
    });
  },

  generatePrivateKeySync(account, protocol) {
    let newkey = new ctypes.void_t.ptr();
    let err = OTRLib.otrl_privkey_generate_start(
      OTR.userstate, account, protocol, newkey.address()
    );
    if (err || newkey.isNull())
      return "otrl_privkey_generate_start (" + err + ")";

    err = OTRLib.otrl_privkey_generate_calculate(newkey);
    if (!err) {
      err = OTRLib.otrl_privkey_generate_finish(
        OTR.userstate, newkey, OTR.privateKeyPath);
    }
    if (err && !newkey.isNull()) {
      OTRLib.otrl_privkey_generate_cancelled(OTR.userstate, newkey);
    }

    if (err) {
      return "otrl_privkey_generate_calculate (" + err + ")";
    }
    return null;
  },

  // write fingerprints to file synchronously
  writeFingerprints() {
    if (OTRLib.otrl_privkey_write_fingerprints(
      this.userstate, this.fingerprintsPath
    )) throw new Error("Failed to write fingerprints.");
  },

  // generate instance tag synchronously
  generateInstanceTag(account, protocol) {
    if (OTRLib.otrl_instag_generate(
      this.userstate, this.instanceTagsPath, account, protocol
    )) throw new Error("Failed to generate instance tag.");
  },

  // get my fingerprint
  privateKeyFingerprint(account, protocol) {
    let fingerprint = OTRLib.otrl_privkey_fingerprint(
      this.userstate, new OTRLib.fingerprint_t(), account, protocol
    );
    return fingerprint.isNull() ? null : fingerprint.readString();
  },

  // return a human readable string for a fingerprint
  hashToHuman(fingerprint) {
    let hash;
    try {
      hash = fingerprint.contents.fingerprint;
    } catch (e) {}
    if (!hash || hash.isNull())
      throw new Error("No fingerprint found.");
    let human = new OTRLib.fingerprint_t();
    OTRLib.otrl_privkey_hash_to_human(human, hash);
    return human.readString();
  },

  base64encode(data, dataLen) {
    // CData objects are initialized with zeroes.  The plus one gives us
    // our null byte so that readString below is safe.
    let buf = ctypes.char.array(Math.floor((dataLen + 2) / 3) * 4 + 1)();
    OTRLib.otrl_base64_encode(buf, data, dataLen); // ignore returned size
    return buf.readString();  // str
  },

  base64decode(str) {
    let size = str.length;
    // +1 here so that we're safe in calling readString on data in the tests.
    let data = ctypes.unsigned_char.array(Math.floor((size + 3) / 4) * 3 + 1)();
    OTRLib.otrl_base64_decode(data, str, size); // ignore returned len
    // We aren't returning the dataLen since we know the hash length in our
    // one use case so far.
    return data;
  },

  getTrustLevel(context) {
    let level = OTR.trust(context);
    if (level === OTR.trustState.TRUST_PRIVATE) {
      return OTR.trustState.TRUST_PRIVATE;
    } else if (level === OTR.trustState.TRUST_UNVERIFIED) {
      return OTR.trustState.TRUST_UNVERIFIED;
    } else if (level === OTR.trustState.TRUST_FINISHED) {
      return OTR.trustState.TRUST_FINISHED;
    }
    return OTR.trustState.TRUST_NOT_PRIVATE;
  },

  // Fetch list of known fingerprints, either for the given account,
  // or for all accounts, if parameter is null.
  knownFingerprints(forAccount) {
    let fps = [];
    for (
      let context = this.userstate.contents.context_root;
      !context.isNull();
      context = context.contents.next
    ) {
      // skip child contexts
      if (!comparePointers(context.contents.m_context, context))
        continue;
      let wContext = new Context(context);

      if (forAccount) {
        if (forAccount.normalizedName != wContext.account ||
            forAccount.protocol.normalizedName != wContext.protocol) {
          continue;
        }
      }

      for (
        let fingerprint = context.contents.fingerprint_root.next;
        !fingerprint.isNull();
        fingerprint = fingerprint.contents.next
      ) {
        let trust = trustFingerprint(fingerprint);
        fps.push({
          fpointer: fingerprint.contents.address(),
          fingerprint: OTR.hashToHuman(fingerprint),
          screenname: wContext.username,
          trust,
          purge: false,
        });
      }
    }
    return fps;
  },

  /**
   * Returns true, if all requested fps were removed.
   * Returns false, if at least one fps couldn't get removed,
   * because it's currently actively used.
   */
  forgetFingerprints(fps) {
    let result = true;
    let write = false;
    fps.forEach(function(obj, i) {
      if (!obj.purge) {
        return;
      }
      obj.purge = false;  // reset early
      let fingerprint = obj.fpointer;
      if (fingerprint.isNull()) {
        return;
      }
      // don't remove if fp is active and we're in an encrypted state
      let context = fingerprint.contents.context.contents.m_context;
      for (
        let context_itr = context;
        !context_itr.isNull() &&
          comparePointers(context_itr.contents.m_context, context);
        context_itr = context_itr.contents.next
      ) {
        if (
          context_itr.contents.msgstate === OTRLib.messageState.OTRL_MSGSTATE_ENCRYPTED &&
          comparePointers(context_itr.contents.active_fingerprint, fingerprint)
        ) {
          result = false;
          return;
        }
      }
      write = true;
      OTRLib.otrl_context_forget_fingerprint(fingerprint, 1);
      fps[i] = null;  // null out removed fps
    });
    if (write) {
      OTR.writeFingerprints();
    }
    return result;
  },

  addFingerprint(context, hex) {
    let fingerprint = new OTRLib.hash_t();
    if (hex.length != 40) throw new Error("Invalid fingerprint value.");
    let bytes = hex.match(/.{1,2}/g);
    for (let i = 0; i < 20; i++)
      fingerprint[i] = parseInt(bytes[i], 16);
    return OTRLib.otrl_context_find_fingerprint(context._context, fingerprint, 1, null);
  },

  getFingerprintsForRecipient(account, protocol, recipient) {
    let fingers = OTR.knownFingerprints();
    return fingers.filter(function(fg) {
      return fg.account == account &&
             fg.protocol == protocol &&
             fg.screenname == recipient;
    });
  },

  isFingerprintTrusted(fingerprint) {
    return !!OTRLib.otrl_context_is_fingerprint_trusted(fingerprint);
  },

  // update trust in fingerprint
  setTrust(fingerprint, trust, context) {
    // ignore if no change in trust
    if (context && (trust === context.trust))
      return;
    OTRLib.otrl_context_set_trust(fingerprint, trust ? "verified" : "");
    this.writeFingerprints();
    if (context)
      this.notifyTrust(context);
  },

  notifyTrust(context) {
    this.notifyObservers(context, "otr:msg-state");
    this.notifyObservers(context, "otr:trust-state");
  },

  authUpdate(context, progress, success) {
    this.notifyObservers({
      context,
      progress,
      success,
    }, "otr:auth-update");
  },

  // expose message states
  getMessageState() {
    return OTRLib.messageState;
  },

  // get context from conv
  getContext(conv) {
    let context = OTRLib.otrl_context_find(
      this.userstate,
      conv.normalizedName,
      conv.account.normalizedName,
      // TODO: check why sometimes normalizedName is undefined, and if
      // that's ok. Fallback wasn't necessary in the original code.
      conv.account.protocol.normalizedName || "",
      OTRLib.instag.OTRL_INSTAG_BEST, 1, null, null, null
    );
    return new Context(context);
  },

  getContextFromRecipient(account, protocol, recipient) {
    let context = OTRLib.otrl_context_find(
      this.userstate, recipient, account, protocol,
      OTRLib.instag.OTRL_INSTAG_BEST, 1, null, null, null
    );
    return new Context(context);
  },

  getUIConvFromContext(context) {
    return this.getUIConvForRecipient(
      context.account, context.protocol, context.username
    );
  },

  getUIConvForRecipient(account, protocol, recipient) {
    let uiConvs = this._convos.values();
    let uiConv = uiConvs.next();
    while (!uiConv.done) {
      let conv = uiConv.value.target;
      if (conv.account.normalizedName === account &&
          conv.account.protocol.normalizedName === protocol &&
          conv.normalizedName === recipient) {
          // console.log("=== getUIConvForRecipient found, account: " + account + "  protocol: " + protocol + "  recip: " + recipient);
        return uiConv.value;
      }
      uiConv = uiConvs.next();
    }
    throw new Error("Couldn't find conversation.");
  },

  getUIConvFromConv(conv) {
    // return this._convos.get(conv.id);
    return Services.conversations.getUIConversation(conv);
  },

  disconnect(conv, remove) {
    OTRLib.otrl_message_disconnect(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account.normalizedName,
      conv.account.protocol.normalizedName,
      conv.normalizedName,
      OTRLib.instag.OTRL_INSTAG_BEST
    );
    if (remove) {
      let uiConv = this.getUIConvFromConv(conv);
      if (uiConv)
        this.removeConversation(uiConv);
    } else
      this.notifyObservers(this.getContext(conv), "otr:disconnected");
  },

  getAccountPref(prefName, accountId, defaultVal) {
    return Services.prefs.getBoolPref(
      "messenger.account." + accountId + ".options." + prefName,
      defaultVal);
  },

  sendQueryMsg(conv) {
    let req = this.getAccountPref("otrRequireEncryption", conv.account.id,
      Services.prefs.getBoolPref("chat.otr.default.requireEncryption"));
    let query = OTRLib.otrl_proto_default_query_msg(
      conv.account.normalizedName,
      req ?
        OTRLib.OTRL_POLICY_ALWAYS : OTRLib.OTRL_POLICY_OPPORTUNISTIC
    );
    if (query.isNull()) {
      Cu.reportError(new Error("Sending query message failed."));
      return;
    }
    // Use the default msg to format the version.
    // We don't supprt v1 of the protocol so this should be fine.
    let queryMsg = /^\?OTR.*?\?/.exec(query.readString())[0] + "\n";
    // Avoid sending any numbers in the query message, because receiving
    // software could misinterpret it as a protocol version.
    // See https://bugzilla.mozilla.org/show_bug.cgi?id=1536108
    let noNumbersName = conv.account.normalizedName.replace(/[0-9]/g, "#");
    queryMsg += _strArgs("query-msg", {name: noNumbersName});
    conv.sendMsg(queryMsg);
    OTRLib.otrl_message_free(query);
  },

  trustState: {
    TRUST_NOT_PRIVATE: 0,
    TRUST_UNVERIFIED: 1,
    TRUST_PRIVATE: 2,
    TRUST_FINISHED: 3,
  },

  // Check the attributes of the OTR context, and derive how that maps
  // to one of the above trust states, which we'll show to the user.
  // If we have an encrypted channel, it depends on the presence of a
  // context.trust object, if we treat is as private or unverified.
  trust(context) {
    let level = this.trustState.TRUST_NOT_PRIVATE;
    switch (context.msgstate) {
      case OTRLib.messageState.OTRL_MSGSTATE_ENCRYPTED:
        level = context.trust
          ? this.trustState.TRUST_PRIVATE
          : this.trustState.TRUST_UNVERIFIED;
        break;
      case OTRLib.messageState.OTRL_MSGSTATE_FINISHED:
        level = this.trustState.TRUST_FINISHED;
        break;
    }
    return level;
  },

  getPrefBranchFromWrappedContext(wContext) {
    for (let acc of Services.accounts.getAccounts()) {
      if (wContext.account == acc.normalizedName &&
          wContext.protocol == acc.protocol.normalizedName) {
        return acc.prefBranch;
      }
    }
    return null;
  },

  // uiOps callbacks

  /**
   * Return the OTR policy for the given context.
   */
  policy_cb(opdata, context) {
    let wContext = new Context(context);
    let pb = OTR.getPrefBranchFromWrappedContext(wContext);
    if (!pb) {
      return new ctypes.unsigned_int(0);
    }
    let prefRequire = pb.getBoolPref("options.otrRequireEncryption",
      Services.prefs.getBoolPref("chat.otr.default.requireEncryption"));
    return prefRequire ? OTRLib.OTRL_POLICY_ALWAYS
                       : OTRLib.OTRL_POLICY_OPPORTUNISTIC;
  },

  /**
   * Create a private key for the given accountname/protocol if desired.
   */
  create_privkey_cb(opdata, accountname, protocol) {
    let args = {
      account: accountname.readString(),
      protocol: protocol.readString(),
    };
    this.notifyObservers(args, "otr:generate");
  },

  /**
   * Report whether you think the given user is online. Return 1 if you
   * think they are, 0 if you think they aren't, -1 if you're not sure.
   */
  is_logged_in_cb(opdata, accountname, protocol, recipient) {
    let conv = this.getUIConvForRecipient(
      accountname.readString(),
      protocol.readString(),
      recipient.readString()
    ).target;
    return isOnline(conv);
  },

  /**
   * Send the given IM to the given recipient from the given
   * accountname/protocol.
   */
  inject_message_cb(opdata, accountname, protocol, recipient, message) {
    let aMsg = message.readString();
    this.log("inject_message_cb (msglen:" + aMsg.length + "): " + aMsg);
    this.getUIConvForRecipient(
      accountname.readString(),
      protocol.readString(),
      recipient.readString()
    ).target.sendMsg(aMsg);
  },

  /**
   * new fingerprint for the given user has been received.
   */
  new_fingerprint_cb(opdata, us, accountname, protocol, username, fingerprint) {
    let context = OTRLib.otrl_context_find(
      us, username, accountname, protocol,
      OTRLib.instag.OTRL_INSTAG_MASTER, 1, null, null, null
    );

    let seen = false;
    let fp = context.contents.fingerprint_root.next;
    while (!fp.isNull()) {
      if (CLib.memcmp(fingerprint, fp.contents.fingerprint, new ctypes.size_t(20))) {
        seen = true;
        break;
      }
      fp = fp.contents.next;
    }

    let wContext = new Context(context);
    let defaultNudge = Services.prefs.getBoolPref("chat.otr.default.verifyNudge");
    let prefNudge = defaultNudge;
    let pb = OTR.getPrefBranchFromWrappedContext(wContext);
    if (pb) {
      prefNudge = pb.getBoolPref("options.otrVerifyNudge", defaultNudge);
    }

    // Only nudge on new fingerprint, as opposed to always.
    if (!prefNudge)
      this.notifyObservers(wContext, "otr:unverified",
        (seen ? "seen" : "unseen"));
  },

  /**
   * The list of known fingerprints has changed.  Write them to disk.
   */
  write_fingerprint_cb(opdata) {
    this.writeFingerprints();
  },

  /**
   * A ConnContext has entered a secure state.
   */
  gone_secure_cb(opdata, context) {
    let wContext = new Context(context);
    let defaultNudge = Services.prefs.getBoolPref("chat.otr.default.verifyNudge");
    let prefNudge = defaultNudge;
    let pb = OTR.getPrefBranchFromWrappedContext(wContext);
    if (pb) {
      prefNudge = pb.getBoolPref("options.otrVerifyNudge", defaultNudge);
    }
    let strid = "context-gone_secure_" + (wContext.trust ? "private" : "unverified");
    this.notifyObservers(wContext, "otr:msg-state");
    this.sendAlert(wContext, _strArgs(strid, {name: wContext.username}));
    if (prefNudge && !wContext.trust)
      this.notifyObservers(wContext, "otr:unverified", "unseen");
  },

  /**
   * A ConnContext has left a secure state.
   */
  gone_insecure_cb(opdata, context) {
    // This isn't used. See: https://bugs.otr.im/lib/libotr/issues/48
  },

  /**
   * We have completed an authentication, using the D-H keys we already
   * knew.
   *
   * @param is_reply    indicates whether we initiated the AKE.
   */
  still_secure_cb(opdata, context, is_reply) {
    // Indicate the private conversation was refreshed.
    if (!is_reply) {
      context = new Context(context);
      this.notifyObservers(context, "otr:msg-state");
      this.sendAlert(context, _strArgs("context-still_secure", {name: context.username}));
    }
  },

  /**
   * Find the maximum message size supported by this protocol.
   */
  max_message_size_cb(opdata, context) {
    context = new Context(context);
    // These values are, for the most part, from pidgin-otr's mms_table.
    switch (context.protocol) {
    case "irc":
    case "prpl-irc":
      return 417;
    case "facebook":
    case "gtalk":
    case "odnoklassniki":
    case "jabber":
    case "xmpp":
      return 65536;
    case "prpl-yahoo":
      return 799;
    case "prpl-msn":
      return 1409;
    case "prpl-icq":
      return 2346;
    case "prpl-gg":
      return 1999;
    case "prpl-aim":
    case "prpl-oscar":
      return 2343;
    case "prpl-novell":
      return 1792;
    default:
      return 0;
    }
  },

  /**
   * We received a request from the buddy to use the current "extra"
   * symmetric key.
   */
  received_symkey_cb(opdata, context, use, usedata, usedatalen, symkey) {
    // Ignore until we have a use.
  },

  /**
   * Return a string according to the error event.
   */
  otr_error_message_cb(opdata, context, err_code) {
    context = new Context(context);
    let msg;
    switch (err_code) {
    case OTRLib.errorCode.OTRL_ERRCODE_ENCRYPTION_ERROR:
      msg = _str("error-enc");
      break;
    case OTRLib.errorCode.OTRL_ERRCODE_MSG_NOT_IN_PRIVATE:
      msg = _strArgs("error-not_priv", context.username);
      break;
    case OTRLib.errorCode.OTRL_ERRCODE_MSG_UNREADABLE:
      msg = _str("error-unreadable");
      break;
    case OTRLib.errorCode.OTRL_ERRCODE_MSG_MALFORMED:
      msg = _str("error-malformed");
      break;
    default:
      return null;
    }
    return CLib.strdup(msg);
  },

  /**
   * Deallocate a string returned by otr_error_message_cb.
   */
  otr_error_message_free_cb(opdata, err_msg) {
    if (!err_msg.isNull())
      CLib.free(err_msg);
  },

  /**
   * Return a string that will be prefixed to any resent message.
   */
  resent_msg_prefix_cb(opdata, context) {
    return CLib.strdup(_str("resent"));
  },

  /**
   * Deallocate a string returned by resent_msg_prefix.
   */
  resent_msg_prefix_free_cb(opdata, prefix) {
    if (!prefix.isNull())
      CLib.free(prefix);
  },

  /**
   * Update the authentication UI with respect to SMP events.
   */
  handle_smp_event_cb(opdata, smp_event, context, progress_percent, question) {
    context = new Context(context);
    switch (smp_event) {
    case OTRLib.smpEvent.OTRL_SMPEVENT_NONE:
      break;
    case OTRLib.smpEvent.OTRL_SMPEVENT_ASK_FOR_ANSWER:
    case OTRLib.smpEvent.OTRL_SMPEVENT_ASK_FOR_SECRET:
      this.notifyObservers({
        context,
        progress: progress_percent,
        question: question.isNull() ? null : question.readString(),
      }, "otr:auth-ask");
      break;
    case OTRLib.smpEvent.OTRL_SMPEVENT_CHEATED:
      OTR.abortSMP(context);
      /* falls through */
    case OTRLib.smpEvent.OTRL_SMPEVENT_IN_PROGRESS:
    case OTRLib.smpEvent.OTRL_SMPEVENT_SUCCESS:
    case OTRLib.smpEvent.OTRL_SMPEVENT_FAILURE:
    case OTRLib.smpEvent.OTRL_SMPEVENT_ABORT:
      this.authUpdate(context, progress_percent,
        (smp_event === OTRLib.smpEvent.OTRL_SMPEVENT_SUCCESS));
      break;
    case OTRLib.smpEvent.OTRL_SMPEVENT_ERROR:
      OTR.abortSMP(context);
      break;
    default:
      this.log("smp event: " + smp_event);
    }
  },

  /**
   * Handle and send the appropriate message(s) to the sender/recipient
   * depending on the message events.
   */
  handle_msg_event_cb(opdata, msg_event, context, message, err) {
    context = new Context(context);
    switch (msg_event) {
    case OTRLib.messageEvent.OTRL_MSGEVENT_NONE:
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_ENCRYPTION_REQUIRED:
      this.sendAlert(context, _strArgs("msgevent-encryption_required_part1", {name: context.username}));
      this.sendAlert(context, _str("msgevent-encryption_required_part2"));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_ENCRYPTION_ERROR:
      this.sendAlert(context, _str("msgevent-encryption_error"));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_CONNECTION_ENDED:
      this.sendAlert(context, _strArgs("msgevent-connection_ended", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_SETUP_ERROR:
      this.sendAlert(context, _strArgs("msgevent-setup_error", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_MSG_REFLECTED:
      this.sendAlert(context, _str("msgevent-msg_reflected"));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_MSG_RESENT:
      this.sendAlert(context, _strArgs("msgevent-msg_resent", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_RCVDMSG_NOT_IN_PRIVATE:
      this.sendAlert(context, _strArgs("msgevent-rcvdmsg_not_private", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNREADABLE:
      this.sendAlert(context, _strArgs("msgevent-rcvdmsg_unreadable", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_RCVDMSG_MALFORMED:
      this.sendAlert(context, _strArgs("msgevent-rcvdmsg_malformed", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_LOG_HEARTBEAT_RCVD:
      this.log(_strArgs("msgevent-log_heartbeat_rcvd", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_LOG_HEARTBEAT_SENT:
      this.log(_strArgs("msgevent-log_heartbeat_sent", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_RCVDMSG_GENERAL_ERR:
      this.sendAlert(context, _str("msgevent-rcvdmsg_general_err"));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNENCRYPTED:
      this.sendAlert(context, _strArgs("msgevent-rcvdmsg_unencrypted",
        {name: context.username, msg: message.isNull() ? "" : message.readString()}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_RCVDMSG_UNRECOGNIZED:
      this.sendAlert(context, _strArgs("msgevent-rcvdmsg_unrecognized", {name: context.username}));
      break;
    case OTRLib.messageEvent.OTRL_MSGEVENT_RCVDMSG_FOR_OTHER_INSTANCE:
      this.log(_strArgs("msgevent-rcvdmsg_for_other_instance", {name: context.username}));
      break;
    default:
      this.log("msg event: " + msg_event);
    }
  },

  /**
   * Create an instance tag for the given accountname/protocol if
   * desired.
   */
  create_instag_cb(opdata, accountname, protocol) {
    this.generateInstanceTag(accountname.readString(), protocol.readString());
  },

  /**
   * When timer_control is called, turn off any existing periodic timer.
   * Additionally, if interval > 0, set a new periodic timer to go off
   * every interval seconds.
   */
  timer_control_cb(opdata, interval) {
    if (this._poll_timer) {
      clearInterval(this._poll_timer);
      this._poll_timer = null;
    }
    if (interval > 0) {
      this._poll_timer = setInterval(() => {
        OTRLib.otrl_message_poll(this.userstate, this.uiOps.address(), null);
      }, interval * 1000);
    }
  },

  // end of uiOps

  initUiOps() {
    this.uiOps = new OTRLib.OtrlMessageAppOps();

    let methods = [
      "policy",
      "create_privkey",
      "is_logged_in",
      "inject_message",
      "update_context_list",  // not implemented
      "new_fingerprint",
      "write_fingerprint",
      "gone_secure",
      "gone_insecure",
      "still_secure",
      "max_message_size",
      "account_name",  // not implemented
      "account_name_free",  // not implemented
      "received_symkey",
      "otr_error_message",
      "otr_error_message_free",
      "resent_msg_prefix",
      "resent_msg_prefix_free",
      "handle_smp_event",
      "handle_msg_event",
      "create_instag",
      "convert_msg",  // not implemented
      "convert_free",  // not implemented
      "timer_control",
    ];

    for (let i = 0; i < methods.length; i++) {
      let m = methods[i];
      if (!this[m + "_cb"]) {
        this.uiOps[m] = null;
        continue;
      }
      // keep a pointer to this in memory to avoid crashing
      this[m + "_cb"] = OTRLib[m + "_cb_t"](this[m + "_cb"].bind(this));
      this.uiOps[m] = this[m + "_cb"];
    }
  },

  sendAlert(context, msg) {
    this.getUIConvFromContext(context).systemMessage(msg);
  },

  observe(aObject, aTopic, aMsg) {
    switch (aTopic) {
    case "sending-message":
      this.onSend(aObject);
      break;
    case "received-message":
      this.onReceive(aObject);
      break;
    case "new-ui-conversation":
      this.addConversation(aObject);
      break;
    }
  },

  addConversation(uiConv) {
    let conv = uiConv.target;
    if (conv.isChat)
      return;
    this._convos.set(conv.id, uiConv);
    uiConv.addObserver(this);
  },

  removeConversation(uiConv) {
    uiConv.removeObserver(this);
    this._convos.delete(uiConv.target.id);
    this.clearMsgs(uiConv.target.id);
  },

  sendSecret(context, secret, question) {
    let str = ctypes.char.array()(secret);
    let strlen = new ctypes.size_t(str.length - 1);
    OTRLib.otrl_message_initiate_smp_q(
      this.userstate,
      this.uiOps.address(),
      null,
      context._context,
      question ? question : null,
      str,
      strlen
    );
  },

  sendResponse(context, response) {
    let str = ctypes.char.array()(response);
    let strlen = new ctypes.size_t(str.length - 1);
    OTRLib.otrl_message_respond_smp(
      this.userstate,
      this.uiOps.address(),
      null,
      context._context,
      str,
      strlen
    );
  },

  abortSMP(context) {
    OTRLib.otrl_message_abort_smp(
      this.userstate,
      this.uiOps.address(),
      null,
      context._context
    );
  },

  onSend(om) {
    if (om.cancelled)
      return;

    let conv = om.conversation;
    if (conv.isChat)
      return;

    // check for irc action messages
    if (om.action) {
      om.cancelled = true;
      let uiConv = this.getUIConvFromConv(conv);
      if (uiConv)
        uiConv.sendMsg("/me " + om.message);
      return;
    }

    let newMessage = new ctypes.char.ptr();

    this.log("pre sending: " + om.message);

    let err = OTRLib.otrl_message_sending(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account.normalizedName,
      conv.account.protocol.normalizedName,
      conv.normalizedName,
      OTRLib.instag.OTRL_INSTAG_BEST,
      om.message,
      null,
      newMessage.address(),
      OTRLib.fragPolicy.OTRL_FRAGMENT_SEND_ALL_BUT_LAST,
      null,
      null,
      null
    );

    let msg = om.message;

    if (err) {
      om.cancelled = true;
      Cu.reportError(new Error("Failed to send message. Returned code: " + err));
    } else if (!newMessage.isNull()) {
      msg = newMessage.readString();
      // https://bugs.otr.im/lib/libotr/issues/52
      if (!msg) {
        om.cancelled = true;
      }
    }

    if (!om.cancelled) {
      // OTR handshakes only work while both peers are online.
      // Sometimes we want to include a special whitespace suffix,
      // which the OTR protocol uses to signal that the sender is willing
      // to start an OTR session. Don't do that for offline messages.
      // See: https://bugs.otr.im/lib/libotr/issues/102
      if (isOnline(conv) === 0 ||
          // Twitter trims tweets.
          conv.account.protocol.normalizedName === "twitter") {
        let ind = msg.indexOf(OTRLib.OTRL_MESSAGE_TAG_BASE);
        if (ind > -1) {
          msg = msg.substring(0, ind);
          let context = this.getContext(conv);
          context._context.contents.otr_offer = OTRLib.otr_offer.OFFER_NOT;
        }
      }

      this.bufferMsg(conv.id, om.message, msg);
      om.message = msg;
    }

    this.log("post sending (" + !om.cancelled + "): " + om.message);
    OTRLib.otrl_message_free(newMessage);
  },

  onReceive(im) {
    if (im.cancelled || im.system)
      return;

    let conv = im.conversation;
    if (conv.isChat)
      return;

    // After outgoing messages have been handled in onSend,
    // they are again passed back to us, here in onReceive.
    // This is our chance to prevent both outgoing and incoming OTR
    // messages from being logged here.
    if (im.originalMessage.startsWith("?OTR")) {
      im.encrypted = true;
    }

    if (im.outgoing) {
      this.log("outgoing message to display: " + im.displayMessage);
      this.pluckMsg(im);
      return;
    }

    let newMessage = new ctypes.char.ptr();
    let tlvs = new OTRLib.OtrlTLV.ptr();

    this.log("pre receiving: " + im.displayMessage);

    let err = OTRLib.otrl_message_receiving(
      this.userstate,
      this.uiOps.address(),
      null,
      conv.account.normalizedName,
      conv.account.protocol.normalizedName,
      conv.normalizedName,
      im.displayMessage,
      newMessage.address(),
      tlvs.address(),
      null,
      null,
      null
    );

    if (!newMessage.isNull()) {
      im.displayMessage = newMessage.readString();
    }

    // search tlvs for a disconnect msg
    // https://bugs.otr.im/lib/libotr/issues/54
    let tlv = OTRLib.otrl_tlv_find(tlvs, OTRLib.tlvs.OTRL_TLV_DISCONNECTED);
    if (!tlv.isNull()) {
      let context = this.getContext(conv);
      this.notifyObservers(context, "otr:disconnected");
      this.sendAlert(context, _strArgs("tlv-disconnected", {name: conv.normalizedName}));
    }

    if (err) {
      this.log("error (" + err + ") ignoring: " + im.displayMessage);
      im.cancelled = true;  // ignore
    } else {
      this.log("post receiving: " + im.displayMessage);
    }

    OTRLib.otrl_tlv_free(tlvs);
    OTRLib.otrl_message_free(newMessage);
  },

  // observer interface

  addObserver(observer) {
    if (!this._observers.includes(observer))
      this._observers.push(observer);
  },

  removeObserver(observer) {
    this._observers = this._observers.filter(o => o !== observer);
  },

  notifyObservers(aSubject, aTopic, aData) {
    for (let observer of this._observers) {
      observer.observe(aSubject, aTopic, aData);
    }
  },

  // buffer messages

  clearMsgs(convId) {
    this._buffer = this._buffer.filter((msg) => msg.convId !== convId);
  },

  bufferMsg(convId, display, sent) {
    this._buffer.push({
      convId,
      display,
      sent,
      time: Date.now(),
    });
  },

  pluckMsg(im) {
    let buf = this._buffer;
    for (let i = 0; i < buf.length; i++) {
      let b = buf[i];
      if (b.convId === im.conversation.id && b.sent === im.displayMessage) {
        im.displayMessage = b.display;
        buf.splice(i, 1);
        this.log("displaying: " + b.display);
        return;
      }
    }
    // don't display if it wasn't buffered
    im.cancelled = true;
    this.log("not displaying: " + im.displayMessage);
  },

};

// exports

this.EXPORTED_SYMBOLS = ["OTR"];
