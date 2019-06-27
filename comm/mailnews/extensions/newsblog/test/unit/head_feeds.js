var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var {mailTestUtils} = ChromeUtils.import("resource://testing-common/mailnews/mailTestUtils.js");
var {localAccountUtils} = ChromeUtils.import("resource://testing-common/mailnews/localAccountUtils.js");

let {Feed, FeedItem, FeedParser, FeedUtils} = ChromeUtils.import("resource:///modules/FeedUtils.jsm");
let {HttpServer} = ChromeUtils.import("resource://testing-common/httpd.js");

// Set up local web server to serve up test files.
// We run it on a random port so that other tests can run concurrently
// even if they also run a web server.
let httpServer = new HttpServer();
httpServer.registerDirectory("/", do_get_file("resources"));
httpServer.start(-1);
const SERVER_PORT = httpServer.identity.primaryPort;

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../../";

registerCleanupFunction(function() {
  httpServer.stop(function() {
    load(gDEPTH + "mailnews/resources/mailShutdown.js");
  });
});
