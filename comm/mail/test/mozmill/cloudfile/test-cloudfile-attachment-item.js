/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests Filelink attachment item behaviour.
 */

"use strict";

/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-compose-helpers.js */
/* import-globals-from ../shared-modules/test-cloudfile-helpers.js */
/* import-globals-from ../shared-modules/test-attachment-helpers.js */

var MODULE_NAME = "test-cloudfile-attachment-item";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "compose-helpers",
  "cloudfile-helpers",
  "attachment-helpers",
];

var kAttachmentItemContextID = "msgComposeAttachmentItemContext";

var {cloudFileAccounts} = ChromeUtils.import("resource:///modules/cloudFileAccounts.jsm");

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  gMockFilePickReg.register();
  gMockCloudfileManager.register();
}

function teardownModule(module) {
  gMockCloudfileManager.unregister();
  gMockFilePickReg.unregister();
}

/**
 * Test that when an upload has been started, we can cancel and restart
 * the upload, and then cancel again.  For this test, we repeat this
 * 3 times.
 */
function test_upload_cancel_repeat() {
  const kFile = "./data/testFile1";

  // Prepare the mock file picker to return our test file.
  let file = getFile(kFile, __file__);
  gMockFilePicker.returnFiles = [file];

  let provider = new MockCloudfileAccount();
  provider.init("someKey");
  let cw = open_compose_new_mail();

  // We've got a compose window open, and our mock Filelink provider
  // ready.  Let's attach a file...
  cw.window.AttachFile();

  // Now we override the uploadFile function of the MockCloudfileAccount
  // so that we're perpetually uploading...
  let promise;
  let started;
  provider.uploadFile = function(aFile) {
    return new Promise((resolve, reject) => {
      promise = { resolve, reject };
      started = true;
    });
  };

  const kAttempts = 3;
  for (let i = 0; i < kAttempts; i++) {
    promise = null;
    started = false;

    // Select the attachment, and choose to convert it to a Filelink
    select_attachments(cw, 0)[0];
    cw.window.convertSelectedToCloudAttachment(provider);
    cw.waitFor(() => started);

    assert_can_cancel_upload(cw, provider, promise, file);
  }

  close_compose_window(cw);
}

/**
 * Test that we can cancel a whole series of files being uploaded at once.
 */
function test_upload_multiple_and_cancel() {
  const kFiles = ["./data/testFile1",
                  "./data/testFile2",
                  "./data/testFile3"];

  // Prepare the mock file picker to return our test file.
  let files = collectFiles(kFiles, __file__);
  gMockFilePicker.returnFiles = files;

  let provider = new MockCloudfileAccount();
  provider.init("someKey");
  let cw = open_compose_new_mail();

  let promise;
  provider.uploadFile = function(aFile) {
    return new Promise((resolve, reject) => {
      promise = { resolve, reject };
    });
  };

  add_cloud_attachments(cw, provider, false);

  for (let i = files.length - 1; i >= 0; --i) {
    assert_can_cancel_upload(cw, provider, promise, files[i]);
  }

  close_compose_window(cw);
}

/**
 * Helper function that takes an upload in progress, and cancels it,
 * ensuring that the nsIMsgCloduFileProvider.uploadCanceled status message
 * is returned to the passed in listener.
 *
 * @param aController the compose window controller to use.
 * @param aProvider a MockCloudfileAccount for which the uploads have already
 *                  started.
 * @param aListener the nsIRequestObserver passed to aProvider's uploadFile
 *                  function.
 * @param aTargetFile the nsIFile to cancel the upload for.
 */
function assert_can_cancel_upload(aController, aProvider, aPromise, aTargetFile) {
  let cancelled = false;

  // Override the provider's cancelFileUpload function.  We can do this because
  // it's assumed that the provider is a MockCloudfileAccount.
  aProvider.cancelFileUpload = function(aFileToCancel) {
    if (aTargetFile.equals(aFileToCancel)) {
      aPromise.reject(cloudFileAccounts.constants.uploadCancelled);
      cancelled = true;
    }
  };

  // Retrieve the attachment bucket index for the target file...
  let index = get_attachmentitem_index_for_file(aController,
                                                aTargetFile);

  // Select that attachmentitem in the bucket
  select_attachments(aController, index)[0];

  // Bring up the context menu, and click cancel.
  let cmd = aController.e("cmd_cancelUpload");
  aController.window.updateAttachmentItems();

  assert_false(cmd.hidden);
  assert_false(cmd.disabled);
  let cancelItem = aController.eid("composeAttachmentContext_cancelUploadItem");
  aController.click(cancelItem);

  // Close the popup, and wait for the cancellation to be complete.
  close_popup(aController, aController.eid(kAttachmentItemContextID));
  aController.waitFor(() => cancelled);
}

/**
 * A helper function to find the attachment bucket index for a particular
 * nsIFile. Returns null if no attachmentitem is found.
 *
 * @param aController the compose window controller to use.
 * @param aFile the nsIFile to search for.
 */
function get_attachmentitem_index_for_file(aController, aFile) {
  // Get the fileUrl from the file.
  let fileUrl = aController.window.FileToAttachment(aFile).url;

  // Get the bucket, and go through each item looking for the matching
  // attachmentitem.
  let bucket = aController.e("attachmentBucket");
  for (let i = 0; i < bucket.getRowCount(); ++i) {
    let attachmentitem = bucket.getItemAtIndex(i);
    if (attachmentitem.attachment.url == fileUrl)
      return i;
  }
  return null;
}
