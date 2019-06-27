/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Tests:
 * - getNewMessages for a newsgroup folder (single message).
 * - DisplayMessage for a newsgroup message
 *   - Downloading a single message and checking content in stream is correct.
 */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

// The basic daemon to use for testing nntpd.js implementations
var daemon = setupNNTPDaemon();

var server;
var localserver;

var streamListener = {
  _data: "",

  QueryInterface:
    ChromeUtils.generateQI([Ci.nsIStreamListener, Ci.nsIRequestObserver]),

  // nsIRequestObserver
  onStartRequest(aRequest) {
  },
  onStopRequest(aRequest, aStatusCode) {
    Assert.equal(aStatusCode, 0);

    // Reduce any \r\n to just \n so we can do a good comparison on any
    // platform.
    var reduced = this._data.replace(/\r\n/g, "\n");
    Assert.equal(reduced, kSimpleNewsArticle);

    // We must finish closing connections and tidying up after a timeout
    // so that the thread has time to unwrap itself.
    do_timeout(0, doTestFinished);
  },

  // nsIStreamListener
  onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
    let scriptStream = Cc["@mozilla.org/scriptableinputstream;1"]
                         .createInstance(Ci.nsIScriptableInputStream);

    scriptStream.init(aInputStream);

    this._data += scriptStream.read(aCount);
  },
};

function doTestFinished() {
    localserver.closeCachedConnections();

    server.stop();

    var thread = gThreadManager.currentThread;
    while (thread.hasPendingEvents())
      thread.processNextEvent(true);

    do_test_finished();
}

function run_test() {
  server = makeServer(NNTP_RFC977_handler, daemon);
  server.start();
  localserver = setupLocalServer(server.port);

  try {
    // Get the folder and new mail
    var folder = localserver.rootFolder.getChildNamed("test.subscribe.simple");
    folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
    folder.getNewMessages(null, {
      OnStopRunningUrl() { localserver.closeCachedConnections(); },
    });
    server.performTest();

    Assert.equal(folder.getTotalMessages(false), 1);
    Assert.ok(folder.hasNewMessages);

    server.resetTest();

    var message = folder.firstNewMessage;

    var messageUri = folder.getUriForMsg(message);

    var nntpService = MailServices.nntp.QueryInterface(Ci.nsIMsgMessageService);

    do_test_pending();

    nntpService.DisplayMessage(messageUri, streamListener, null, null, null, {});
  } catch (e) {
    server.stop();
    do_throw(e);
  }
}
