/*
 * Test nsMsgDatabase's cleanup of nsMsgDBEnumerators
 */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

var anyOldMessage = do_get_file("../../../../data/bugmail1");

/**
 * Test closing a db with an outstanding enumerator.
 */
function test_enumerator_cleanup() {
  let db = localAccountUtils.inboxFolder.msgDatabase;
  let enumerator = db.EnumerateMessages();
  Cc["@mozilla.org/msgDatabase/msgDBService;1"]
    .getService(Ci.nsIMsgDBService)
    .forceFolderDBClosed(localAccountUtils.inboxFolder);
  localAccountUtils.inboxFolder.msgDatabase = null;
  db = null;
  gc();
  while (enumerator.hasMoreElements())
    enumerator.getNext();

  do_test_finished();
}

/*
 * This infrastructure down here exists just to get
 *  test_references_header_parsing its message header.
 */

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  do_test_pending();
  MailServices.copy.CopyFileMessage(anyOldMessage, localAccountUtils.inboxFolder, null,
                                    false, 0, "", messageHeaderGetterListener, null);
  return true;
}

var messageHeaderGetterListener = {
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  GetMessageId(aMessageId) {},
  SetMessageKey(aKey) {},
  OnStopCopy(aStatus) {
    do_timeout(0, test_enumerator_cleanup);
  },
};
