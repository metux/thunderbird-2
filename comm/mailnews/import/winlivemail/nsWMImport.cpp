/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Windows Live Mail (Win32) import mail and addressbook interfaces
 */

#include "nscore.h"
#include "nsString.h"
#include "nsMsgUtils.h"
#include "nsWMImport.h"
#include "nsIImportMail.h"
#include "nsIImportMailboxDescriptor.h"
#include "nsXPCOM.h"
#include "nsWMSettings.h"
#include "nsTextFormatter.h"
#include "nsWMStringBundle.h"
#include "nsUnicharUtils.h"

#include "ImportDebug.h"

class ImportWMMailImpl : public nsIImportMail {
 public:
  ImportWMMailImpl();

  static nsresult Create(nsIImportMail **aImport);

  // nsISupports interface
  NS_DECL_THREADSAFE_ISUPPORTS

  // nsIImportmail interface

  /* void GetDefaultLocation (out nsIFile location, out boolean found, out
   * boolean userVerify); */
  NS_IMETHOD GetDefaultLocation(nsIFile **location, bool *found,
                                bool *userVerify);

  /* nsIArray FindMailboxes (in nsIFile location); */
  NS_IMETHOD FindMailboxes(nsIFile *location, nsIArray **_retval);

  NS_IMETHOD ImportMailbox(nsIImportMailboxDescriptor *source,
                           nsIMsgFolder *dstFolder, char16_t **pErrorLog,
                           char16_t **pSuccessLog, bool *fatalError);

  /* unsigned long GetImportProgress (); */
  NS_IMETHOD GetImportProgress(uint32_t *_retval);

  NS_IMETHOD TranslateFolderName(const nsAString &aFolderName,
                                 nsAString &_retval);

 public:
  static void ReportSuccess(nsString &name, int32_t count, nsString *pStream);
  static void ReportError(int32_t errorNum, nsString &name, nsString *pStream);
  static void AddLinebreak(nsString *pStream);
  static void SetLogs(nsString &success, nsString &error, char16_t **pError,
                      char16_t **pSuccess);

 private:
  virtual ~ImportWMMailImpl();
};

nsWMImport::nsWMImport() {
  IMPORT_LOG0("nsWMImport Module Created\n");
  nsWMStringBundle::GetStringBundle();
}

nsWMImport::~nsWMImport() { IMPORT_LOG0("nsWMImport Module Deleted\n"); }

NS_IMPL_ISUPPORTS(nsWMImport, nsIImportModule)

NS_IMETHODIMP nsWMImport::GetName(char16_t **name) {
  NS_ENSURE_ARG_POINTER(name);
  // nsString  title = "Windows Live Mail";
  // *name = ToNewUnicode(title);
  *name = nsWMStringBundle::GetStringByID(WMIMPORT_NAME);

  return NS_OK;
}

NS_IMETHODIMP nsWMImport::GetDescription(char16_t **name) {
  NS_ENSURE_ARG_POINTER(name);

  // nsString  desc = "Windows Live Mail mail and address books";
  // *name = ToNewUnicode(desc);
  *name = nsWMStringBundle::GetStringByID(WMIMPORT_DESCRIPTION);
  return NS_OK;
}

NS_IMETHODIMP nsWMImport::GetSupports(char **supports) {
  NS_ASSERTION(supports != nullptr, "null ptr");
  if (!supports) return NS_ERROR_NULL_POINTER;

  *supports = strdup(kWMSupportsString);
  return NS_OK;
}

NS_IMETHODIMP nsWMImport::GetSupportsUpgrade(bool *pUpgrade) {
  NS_ASSERTION(pUpgrade != nullptr, "null ptr");
  if (!pUpgrade) return NS_ERROR_NULL_POINTER;

  *pUpgrade = true;
  return NS_OK;
}

NS_IMETHODIMP nsWMImport::GetImportInterface(const char *pImportType,
                                             nsISupports **ppInterface) {
  NS_ENSURE_ARG_POINTER(pImportType);
  NS_ENSURE_ARG_POINTER(ppInterface);

  *ppInterface = nullptr;
  nsresult rv;

  if (!strcmp(pImportType, "settings")) {
    nsCOMPtr<nsIImportSettings> pSettings;
    rv = nsWMSettings::Create(getter_AddRefs(pSettings));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsISupports> pInterface(do_QueryInterface(pSettings));
      pInterface.forget(ppInterface);
    }
    return rv;
  }

  return NS_ERROR_NOT_AVAILABLE;
}

/////////////////////////////////////////////////////////////////////////////////
nsresult ImportWMMailImpl::Create(nsIImportMail **aImport) {
  NS_ENSURE_ARG_POINTER(aImport);
  NS_ADDREF(*aImport = new ImportWMMailImpl());
  return NS_OK;
}

ImportWMMailImpl::ImportWMMailImpl() {}

ImportWMMailImpl::~ImportWMMailImpl() {}

NS_IMPL_ISUPPORTS(ImportWMMailImpl, nsIImportMail)

NS_IMETHODIMP ImportWMMailImpl::TranslateFolderName(
    const nsAString &aFolderName, nsAString &_retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP ImportWMMailImpl::GetDefaultLocation(nsIFile **ppLoc, bool *found,
                                                   bool *userVerify) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP ImportWMMailImpl::FindMailboxes(nsIFile *pLoc,
                                              nsIArray **ppArray) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

void ImportWMMailImpl::AddLinebreak(nsString *pStream) {
  if (pStream) pStream->Append(char16_t('\n'));
}

void ImportWMMailImpl::ReportSuccess(nsString &name, int32_t count,
                                     nsString *pStream) {
  if (!pStream) return;
  // load the success string
  char16_t *pFmt = nsWMStringBundle::GetStringByID(WMIMPORT_MAILBOX_SUCCESS);
  nsString pText;
  nsTextFormatter::ssprintf(pText, pFmt, name.get(), count);
  pStream->Append(pText);
  nsWMStringBundle::FreeString(pFmt);
  AddLinebreak(pStream);
}

void ImportWMMailImpl::ReportError(int32_t errorNum, nsString &name,
                                   nsString *pStream) {
  if (!pStream) return;
  // load the error string
  char16_t *pFmt = nsWMStringBundle::GetStringByID(errorNum);
  nsString pText;
  nsTextFormatter::ssprintf(pText, pFmt, name.get());
  pStream->Append(pText);
  nsWMStringBundle::FreeString(pFmt);
  AddLinebreak(pStream);
}

void ImportWMMailImpl::SetLogs(nsString &success, nsString &error,
                               char16_t **pError, char16_t **pSuccess) {
  if (pError) *pError = ToNewUnicode(error);
  if (pSuccess) *pSuccess = ToNewUnicode(success);
}

NS_IMETHODIMP ImportWMMailImpl::ImportMailbox(
    nsIImportMailboxDescriptor *pSource, nsIMsgFolder *pDstFolder,
    char16_t **pErrorLog, char16_t **pSuccessLog, bool *fatalError) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP ImportWMMailImpl::GetImportProgress(uint32_t *pDoneSoFar) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
