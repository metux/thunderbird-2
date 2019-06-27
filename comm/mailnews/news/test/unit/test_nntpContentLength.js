/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Test content length for the news protocol. This focuses on necko URLs
 * that are run externally.
 */

// The basic daemon to use for testing nntpd.js implementations
var daemon = setupNNTPDaemon();

var server;
var localserver;

function run_test() {
  server = makeServer(NNTP_RFC977_handler, daemon);
  server.start();
  localserver = setupLocalServer(server.port);

  try {
    // Get the folder and new mail
    let folder = localserver.rootFolder.getChildNamed("test.subscribe.simple");
    folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
    folder.getNewMessages(null, {
      OnStopRunningUrl() { localserver.closeCachedConnections(); },
    });
    server.performTest();

    Assert.equal(folder.getTotalMessages(false), 1);
    Assert.ok(folder.hasNewMessages);

    server.resetTest();

    // Get the message URI
    let msgHdr = folder.firstNewMessage;
    let messageUri = folder.getUriForMsg(msgHdr);
    // Convert this to a URI that necko can run
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    let neckoURL = {};
    let messageService = messenger.messageServiceFromURI(messageUri);
    messageService.GetUrlForUri(messageUri, neckoURL, null);
    // Don't use the necko URL directly. Instead, get the spec and create a new
    // URL using the IO service
    let urlToRun = Services.io.newURI(neckoURL.value.spec);

    // Get a channel from this URI, and check its content length
    let channel = Services.io.newChannelFromURI(urlToRun,
                                                null,
                                                Services.scriptSecurityManager.getSystemPrincipal(),
                                                null,
                                                Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
                                                Ci.nsIContentPolicy.TYPE_OTHER);
    Assert.equal(channel.contentLength, kSimpleNewsArticle.length);

    // Now try an attachment. &part=1.2
    // XXX the message doesn't really have an attachment
    let attachmentURL = Services.io.newURI(neckoURL.value.spec + "&part=1.2");
    Services.io.newChannelFromURI(attachmentURL,
                                  null,
                                  Services.scriptSecurityManager.getSystemPrincipal(),
                                  null,
                                  Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
                                  Ci.nsIContentPolicy.TYPE_OTHER);
    // Currently attachments have their content length set to the length of the
    // entire message
    Assert.equal(channel.contentLength, kSimpleNewsArticle.length);
  } catch (e) {
    server.stop();
    do_throw(e);
  }
}
