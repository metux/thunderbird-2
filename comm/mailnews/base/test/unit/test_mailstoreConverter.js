/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {OS} = ChromeUtils.import("resource://gre/modules/osfile.jsm");
var {convertMailStoreTo} = ChromeUtils.import("resource:///modules/mailstoreConverter.jsm");

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/berkeleystore;1");

// Test data for round-trip test.
let testEmails = [
  // Base64 encoded bodies.
  "../../../data/01-plaintext.eml",
  "../../../data/02-plaintext+attachment.eml",
  "../../../data/03-HTML.eml",
  "../../../data/04-HTML+attachment.eml",
  "../../../data/05-HTML+embedded-image.eml",
  "../../../data/06-plaintext+HMTL.eml",
  "../../../data/07-plaintext+(HTML+embedded-image).eml",
  "../../../data/08-plaintext+HTML+attachment.eml",
  "../../../data/09-(HTML+embedded-image)+attachment.eml",
  "../../../data/10-plaintext+(HTML+embedded-image)+attachment.eml",

  // XXX TODO: 12 and 20 get screwed up! Bug 1515254

  // Bodies with non-ASCII characters in UTF-8 and other charsets.
  "../../../data/11-plaintext.eml",
  // "../../../data/12-plaintext+attachment.eml",  // using ISO-8859-7 (Greek)
  "../../../data/13-HTML.eml",
  "../../../data/14-HTML+attachment.eml",
  "../../../data/15-HTML+embedded-image.eml",
  "../../../data/16-plaintext+HMTL.eml",                   // text part is base64 encoded
  "../../../data/17-plaintext+(HTML+embedded-image).eml",  // HTML part is base64 encoded
  "../../../data/18-plaintext+HTML+attachment.eml",
  "../../../data/19-(HTML+embedded-image)+attachment.eml",
  // "../../../data/20-plaintext+(HTML+embedded-image)+attachment.eml",  // using windows-1252

  // Bodies with non-ASCII characters in UTF-8 and other charsets, all encoded with quoted printable.
  "../../../data/21-plaintext.eml",
  "../../../data/22-plaintext+attachment.eml",  // using ISO-8859-7 (Greek)
  "../../../data/23-HTML.eml",
  "../../../data/24-HTML+attachment.eml",
  "../../../data/25-HTML+embedded-image.eml",
  "../../../data/26-plaintext+HMTL.eml",                   // text part is base64 encoded
  "../../../data/27-plaintext+(HTML+embedded-image).eml",  // HTML part is base64 encoded
  "../../../data/28-plaintext+HTML+attachment.eml",
  "../../../data/29-(HTML+embedded-image)+attachment.eml",
  "../../../data/30-plaintext+(HTML+embedded-image)+attachment.eml",  // using windows-1252
];

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  add_task(async function() {
    await doMboxTest("test1", "../../../data/mbox_modern", 2);
    await doMboxTest("test2", "../../../data/mbox_mboxrd", 2);
    await doMboxTest("test3", "../../../data/mbox_unquoted", 2);
    await roundTripTest();
    // Ideas for more tests:
    // - check a really big mbox
    // - check with really huge message (larger than one chunk)
    // - check mbox with "From " line on chunk boundary
    // - add tests for maildir->mbox conversion
    // - check that conversions preserve message body (ie that the
    //   "From " line escaping scheme is reversible)
  });

  run_next_test();
}

/**
 * Helper to create a server, account and inbox, and install an
 * mbox file.
 * @param {String} srvName - A unique server name to use for the test.
 * @param {String} mboxFilename - mbox file to install and convert.
 * @returns {nsIMsgIncomingServer} a server.
 */
function setupServer(srvName, mboxFilename) {
  // {nsIMsgIncomingServer} pop server for the test.
  let server = MailServices.accounts.createIncomingServer(srvName, "localhost",
                                                          "pop3");
  let account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  server.QueryInterface(Ci.nsIPop3IncomingServer);
  server.valid = true;

  let inbox = account.incomingServer.rootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);

  // install the mbox file
  let mboxFile = do_get_file(mboxFilename);
  mboxFile.copyTo(inbox.filePath.parent, inbox.filePath.leafName);

  // TODO: is there some way to make folder rescan the mbox?
  // We don't need it for this, but would be nice to do things properly.
  return server;
}

/**
 * Perform an mbox->maildir conversion test.
 *
 * @param {String} srvName - A unique server name to use for the test.
 * @param {String} mboxFilename - mbox file to install and convert.
 * @param {Number} expectCnt - Number of messages expected.
 * @returns {nsIMsgIncomingServer} a server.
 */
async function doMboxTest(srvName, mboxFilename, expectCnt) {
  // set up an account+server+inbox and copy in the test mbox file
  let server = setupServer(srvName, mboxFilename);

  let mailstoreContractId = Services.prefs.getCharPref(
    "mail.server." + server.key + ".storeContractID");

  await convertMailStoreTo(mailstoreContractId, server, new EventTarget());

  // Converted. Now find resulting Inbox/cur directory so
  // we can count the messages there.

  let inbox = server.rootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  // NOTE: the conversion updates the path of the root folder,
  // but _not_ the path of the inbox...
  // Ideally, we'd just use inbox.filePath here, but
  // instead we'll have compose the path manually.

  let curDir = server.rootFolder.filePath;
  curDir.append(inbox.filePath.leafName);
  curDir.append("cur");

  // Sanity check.
  Assert.ok(curDir.isDirectory(), "'cur' directory created");

  // Check number of messages in Inbox/cur is what we expect.
  let cnt = 0;
  let it = curDir.directoryEntries;
  while (it.hasMoreElements()) {
    it.nextFile;
    cnt++;
  }

  Assert.equal(cnt, expectCnt, "expected number of messages (" + mboxFilename + ")");
}

/**
 * Create a temporary directory. The caller is responsible for deleting it.
 *
 * @param {String} prefix - Generated dir name will be of the form:
 *                          "<prefix><random_sequence>".
 * @returns {String} full path of new directory.
 */
async function tempDir(prefix) {
  if (!prefix) {
    prefix = "";
  }
  let tmpDir = OS.Constants.Path.tmpDir;
  while (true) {
    let name = prefix + Math.floor(Math.random() * 0xffffffff).toString(16);
    let fullPath = OS.Path.join(tmpDir, name);
    try {
      await OS.File.makeDir(fullPath, {ignoreExisting: false});
      return fullPath;
    } catch (e) {
      // If directory already exists, try another name. Else bail out.
      if (!(e instanceof OS.File.Error && e.becauseExists)) {
        throw e;
      }
    }
  }
}

/**
 * Test that messages survive unscathed in a roundtrip conversion,
 * maildir -> mbox -> maildir.
 * The final mailbox should have an identical set of files to the initial one,
 * albeit with different filenames.
 * Purely filesystem based.
 *
 * Would be nice to do a mbox->maildir->mbox roundtrip too, but that'd involve
 * parsing the mbox files to compare them (can't just compare mbox files because
 * message order and "From " lines can change).
 */
async function roundTripTest() {
  // Set up initial maildir structure
  let initialRoot = await tempDir("initial");

  let inbox = OS.Path.join(initialRoot, "INBOX");
  await OS.File.makeDir(inbox);
  // Create a couple of subdirs under INBOX
  let subdir = OS.Path.join(initialRoot, "INBOX.sbd");
  await OS.File.makeDir(subdir);
  let foodir = OS.Path.join(subdir, "foo");
  await OS.File.makeDir(foodir);
  let bardir = OS.Path.join(subdir, "bar");
  await OS.File.makeDir(bardir);

  // Populate all the folders with some test emails.
  await populateMaildir(inbox, testEmails);
  await populateMaildir(foodir, testEmails);
  await populateMaildir(bardir, testEmails);

  // Create root dirs for intermediate and final result.
  let mboxRoot = await tempDir("mbox");
  let finalRoot = await tempDir("final");

  // Convert: maildir -> mbox -> maildir
  await doConvert("maildir", initialRoot, "mbox", mboxRoot);
  await doConvert("mbox", mboxRoot, "maildir", finalRoot);

  // compare results - use checksums, because filenames will differ.
  await recursiveMaildirCompare(initialRoot, finalRoot);
}

/**
 * Helper to adapt the callbacks from converterWorker into a promise.
 *
 * @param {String} srcType - type of source ("maildir", "mbox")
 * @param {String} srcRoot - root directory containing the src folders.
 * @param {String} destType - type of destination ("maildir", "mbox")
 * @param {String} destRoot - root directory to place converted store.
 * @returns {Promise} resolved when when conversion is complete.
 */
function doConvert(srcType, srcRoot, destType, destRoot) {
  return new Promise(function(resolve, reject) {
    let worker = new ChromeWorker("resource:///modules/converterWorker.js");
    worker.addEventListener("message", function(ev) {
      if (ev.data.msg == "success") {
        resolve();
      }
    });
    worker.addEventListener("error", function(ev) { reject(ev.message); });
    // Go.
    worker.postMessage({
      "srcType": srcType,
      "destType": destType,
      "srcRoot": srcRoot,
      "destRoot": destRoot,
    });
  });
}

/**
 * Copy a list of email files (.eml) files into a maildir, creating "cur"
 * and "tmp" subdirs if required.
 *
 * @param {String} maildir           - Path to the maildir directory.
 * @param {Array<String>} emailFiles - paths of source .eml files to copy.
 */
async function populateMaildir(maildir, emailFiles) {
  let cur = OS.Path.join(maildir, "cur");
  await OS.File.makeDir(cur);
  await OS.File.makeDir(OS.Path.join(maildir, "tmp"));

  // Normally maildir files would have a name derived from their msg-id field,
  // but here we'll just use a timestamp-based one to save parsing them.
  let ident = Date.now();
  for (let src of emailFiles) {
    let dest = OS.Path.join(cur, ident.toString() + ".eml");
    ident += 1;
    await OS.File.copy(src, dest);
  }
}

/**
 * Calculate checksums for all the messages in an individual maildir.
 * Used to compare the contents of two maildirs. Note that the checksums are
 * disassociated from the filenames they correspond to, as the filenames are
 * not useful for the comparison - two equivalent maildirs can have entirely
 * different filenames.
 *
 * @param {String} maildir - Path to the maildir directory.
 * @returns {Array<String>} sorted list of checksums (as base64 strings).
 */
async function scanMaildir(maildir) {
  let cur = OS.Path.join(maildir, "cur");

  // Get a list of all the email files.
  let files = [];
  let it = new OS.File.DirectoryIterator(cur);
  await it.forEach(function(ent) {
    files.push(ent.path);
  });

  // Calculate checksums for them all.
  let checksums = [];
  for (let f of files) {
    let md5 = Cc["@mozilla.org/security/hash;1"]
      .createInstance(Ci.nsICryptoHash);
    md5.init(Ci.nsICryptoHash.MD5);
    let raw = await OS.File.read(f);
    md5.update(raw, raw.byteLength);

    checksums.push(md5.finish(true));
  }
  checksums.sort();
  return checksums;
}

/**
 * Compare all maildir directories in two directory trees.
 * The comparison is per-maildir, by looking at the checksums of their emails.
 * Asserts a test fail if any differences are found.
 *
 * @param {String} rootA - path to root of maildir store A.
 * @param {String} rootB - path to root of maildir store B.
 */
async function recursiveMaildirCompare(rootA, rootB) {
  let it = new OS.File.DirectoryIterator(rootA);
  let subdirs = [];
  let maildirs = [];
  await it.forEach(function(ent) {
    if (ent.isDir) {
      if (ent.name.endsWith(".sbd")) {
        subdirs.push(ent.name);
      } else {
        // Assume all other dirs are maildirs.
        maildirs.push(ent.name);
      }
    }
  });

  // Compare the maildirs we found here.
  for (let name of maildirs) {
    let checksumsA = await scanMaildir(OS.Path.join(rootA, name));
    let checksumsB = await scanMaildir(OS.Path.join(rootB, name));

    let match = (checksumsA.length == checksumsB.length);
    for (let i = 0; match && i < checksumsA.length; i++) {
      match = (checksumsA[i] == checksumsB[i]);
    }
    Assert.ok(match, "roundtrip preserves messages in maildir " + name);
  }

  // Recurse down into .sbd dirs.
  for (let name of subdirs) {
    await recursiveMaildirCompare(OS.Path.join(rootA, name),
      OS.Path.join(rootB, name));
  }
}

