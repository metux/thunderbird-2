/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Tests sending messages to addresses with non-ASCII characters.
 */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var test = null;
var server;
var finished = false;

var sentFolder;
var originalData;
var expectedAlertMessage;

var kSender     = "from@foo.invalid";
var kToASCII    = "to@foo.invalid";
var kToValid    = "to@v\u00E4lid.foo.invalid";
var kToValidACE = "to@xn--vlid-loa.foo.invalid";
var kToInvalid  = "b\u00F8rken.to@invalid.foo.invalid";
var kToInvalidWithoutDomain = "b\u00F8rken.to";
var NS_ERROR_BUT_DONT_SHOW_ALERT = 0x805530ef;

/* exported alert */// for alertTestUtils.js
function alert(aDialogText, aText) {
  // ignore without domain situation (this is crash test)
  if (test == kToInvalidWithoutDomain)
    return;

  // we should only get here for the kToInvalid test case
  Assert.equal(test, kToInvalid);
  Assert.equal(aText, expectedAlertMessage);
}


// message listener implementations
function msgListener(aRecipient) {
  this.rcpt = aRecipient;
}

msgListener.prototype = {
  // nsIMsgSendListener
  onStartSending(aMsgID, aMsgSize) {},
  onProgress(aMsgID, aProgress, aProgressMax) {},
  onStatus(aMsgID, aMsg) {},
  onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
    try {
      Assert.equal(aStatus, 0);
      do_check_transaction(server.playTransaction(),
                           ["EHLO test",
                            "MAIL FROM:<" + kSender + "> BODY=8BITMIME SIZE=" + originalData.length,
                            "RCPT TO:<" + this.rcpt + ">",
                            "DATA"]);
      // Compare data file to what the server received
      Assert.equal(originalData, server._daemon.post);
    } catch (e) {
      do_throw(e);
    } finally {
      server.stop();
      var thread = gThreadManager.currentThread;
      while (thread.hasPendingEvents())
        thread.processNextEvent(false);
    }
  },
  onGetDraftFolderURI(aFolderURI) {},
  onSendNotPerformed(aMsgID, aStatus) {},

  // nsIMsgCopyServiceListener
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {},
  GetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    Assert.equal(aStatus, 0);
    try {
      // Now do a comparison of what is in the sent mail folder
      let msgData = mailTestUtils
        .loadMessageToString(sentFolder, mailTestUtils.firstMsgHdr(sentFolder));
      // Skip the headers etc that mailnews adds
      var pos = msgData.indexOf("From:");
      Assert.notEqual(pos, -1);
      msgData = msgData.substr(pos);
      Assert.equal(originalData, msgData);
    } catch (e) {
      do_throw(e);
    } finally {
      finished = true;
      do_test_finished();
    }
  },

  // QueryInterface
  QueryInterface: ChromeUtils.generateQI(["nsIMsgSendListener",
                                          "nsIMsgCopyServiceListener"]),
};


function DoSendTest(aRecipient, aRecipientExpected, aExceptionExpected) {
  server = setupServerDaemon();
  server.start();
  var smtpServer = getBasicSmtpServer(server.port);
  var identity = getSmtpIdentity(kSender, smtpServer);
  Assert.equal(identity.doFcc, true);

  // Random test file with data we don't actually care about. ;-)
  var testFile = do_get_file("data/message1.eml");
  originalData = IOUtils.loadFileToString(testFile);

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  var exceptionCaught = 0;
  try {
    var compFields = Cc["@mozilla.org/messengercompose/composefields;1"]
                       .createInstance(Ci.nsIMsgCompFields);
    compFields.from = identity.email;
    compFields.to = aRecipient;

    var msgSend = Cc["@mozilla.org/messengercompose/send;1"]
                    .createInstance(Ci.nsIMsgSend);
    msgSend.sendMessageFile(identity, "", compFields, testFile,
                            false, false, Ci.nsIMsgSend.nsMsgDeliverNow,
                            null, new msgListener(aRecipientExpected), null, null);

    server.performTest();

    do_timeout(10000, function() {
      if (!finished)
        do_throw("Notifications of message send/copy not received");
    });
    do_test_pending();
  } catch (e) {
    exceptionCaught = e.result;
  } finally {
    server.stop();
    var thread = gThreadManager.currentThread;
    while (thread.hasPendingEvents())
      thread.processNextEvent(true);
  }
  Assert.equal(exceptionCaught, aExceptionExpected);
}


function run_test() {
  registerAlertTestUtils();
  var composeProps = Services.strings.createBundle("chrome://messenger/locale/messengercompose/composeMsgs.properties");
  expectedAlertMessage = composeProps.GetStringFromName("errorIllegalLocalPart")
                                     .replace("%s", kToInvalid);

  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  MailServices.accounts.setSpecialFolders();
  sentFolder = localAccountUtils.rootFolder.createLocalSubfolder("Sent");

  // Test 1:
  // Plain ASCII recipient address.
  test = kToASCII;
  DoSendTest(kToASCII, kToASCII, 0);

  // Test 2:
  // The recipient's domain part contains a non-ASCII character, hence the
  // address needs to be converted to ACE before sending.
  // The old code would just strip the non-ASCII character and try to send
  // the message to the remaining - wrong! - address.
  // The new code will translate the domain part to ACE for the SMTP
  // transaction (only), i.e. the To: header will stay as stated by the sender.
  test = kToValid;
  DoSendTest(kToValid, kToValidACE, 0);

  // Test 3:
  // The recipient's local part contains a non-ASCII character, which is not
  // allowed with unextended SMTP.
  // The old code would just strip the invalid character and try to send the
  // message to the remaining - wrong! - address.
  // The new code will present an informational message box and deny sending.
  test = kToInvalid;
  DoSendTest(kToInvalid, kToInvalid, NS_ERROR_BUT_DONT_SHOW_ALERT);

  // Test 4:
  // Bug 856506. invalid char without '@' causes crash.
  test = kToInvalidWithoutDomain;
  DoSendTest(kToInvalidWithoutDomain, kToInvalidWithoutDomain, NS_ERROR_BUT_DONT_SHOW_ALERT);
}
