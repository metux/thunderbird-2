/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
// Tests that SMTP over a SOCKS proxy works.

const {NetworkTestUtils} = ChromeUtils.import("resource://testing-common/mailnews/NetworkTestUtils.jsm");
const {PromiseTestUtils} = ChromeUtils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

const PORT = 25;
var daemon, localserver, server;

add_task(async function setup() {
  server = setupServerDaemon();
  daemon = server._daemon;
  server.start();
  NetworkTestUtils.configureProxy("smtp.tinderbox.invalid", PORT, server.port);
  localserver = getBasicSmtpServer(PORT, "smtp.tinderbox.invalid");
});

add_task(async function sendMessage() {
  equal(daemon.post, undefined);
  let identity = getSmtpIdentity("test@tinderbox.invalid", localserver);
  var testFile = do_get_file("data/message1.eml");
  var urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.smtp.sendMailMessage(testFile, "somebody@example.org", identity,
                                    "me@example.org",
                                    null, urlListener, null, null,
                                    false, {}, {});
  await urlListener.promise;
  notEqual(daemon.post, "");
});

add_task(async function cleanUp() {
  NetworkTestUtils.shutdownServers();
});

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  run_next_test();
}

