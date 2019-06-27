/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsSubscribableServer.h"
#include "nsIMsgIncomingServer.h"
#include "prmem.h"
#include "nsIServiceManager.h"
#include "nsMsgI18N.h"
#include "nsMsgUtils.h"
#include "nsCOMArray.h"
#include "nsArrayEnumerator.h"
#include "nsStringEnumerator.h"
#include "nsServiceManagerUtils.h"
#include "nsTreeColumns.h"
#include "mozilla/dom/DataTransfer.h"

nsSubscribableServer::nsSubscribableServer(void) {
  mDelimiter = '.';
  mShowFullName = true;
  mTreeRoot = nullptr;
  mStopped = false;
}

nsresult nsSubscribableServer::Init() { return NS_OK; }

nsSubscribableServer::~nsSubscribableServer(void) {
  mozilla::DebugOnly<nsresult> rv = FreeRows();
  NS_ASSERTION(NS_SUCCEEDED(rv), "failed to free tree rows");
  rv = FreeSubtree(mTreeRoot);
  NS_ASSERTION(NS_SUCCEEDED(rv), "failed to free tree");
}

NS_IMPL_ISUPPORTS(nsSubscribableServer, nsISubscribableServer, nsITreeView)

NS_IMETHODIMP
nsSubscribableServer::SetIncomingServer(nsIMsgIncomingServer *aServer) {
  if (!aServer) {
    mIncomingServerUri.AssignLiteral("");
    mServerType.Truncate();
    return NS_OK;
  }
  aServer->GetType(mServerType);

  // We intentionally do not store a pointer to the aServer here
  // as it would create reference loops, because nsIImapIncomingServer
  // and nsINntpIncomingServer keep a reference to an internal
  // nsISubscribableServer object.
  // We only need the URI of the server anyway.
  return aServer->GetServerURI(mIncomingServerUri);
}

NS_IMETHODIMP
nsSubscribableServer::GetDelimiter(char *aDelimiter) {
  NS_ENSURE_ARG_POINTER(aDelimiter);
  *aDelimiter = mDelimiter;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetDelimiter(char aDelimiter) {
  mDelimiter = aDelimiter;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetAsSubscribed(const nsACString &path) {
  nsresult rv = NS_OK;

  SubscribeTreeNode *node = nullptr;
  rv = FindAndCreateNode(path, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;
  node->isSubscribable = true;
  node->isSubscribed = true;

  return rv;
}

NS_IMETHODIMP
nsSubscribableServer::AddTo(const nsACString &aName, bool aAddAsSubscribed,
                            bool aSubscribable, bool aChangeIfExists) {
  nsresult rv = NS_OK;

  if (mStopped) {
    return NS_ERROR_FAILURE;
  }

  SubscribeTreeNode *node = nullptr;

  // todo, shouldn't we pass in aAddAsSubscribed, for the
  // default value if we create it?
  rv = FindAndCreateNode(aName, &node);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  if (aChangeIfExists) {
    node->isSubscribed = aAddAsSubscribed;
  }

  node->isSubscribable = aSubscribable;

  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetState(const nsACString &aPath, bool aState,
                               bool *aStateChanged) {
  nsresult rv = NS_OK;
  NS_ASSERTION(!aPath.IsEmpty() && aStateChanged, "no path or stateChanged");
  if (aPath.IsEmpty() || !aStateChanged) return NS_ERROR_NULL_POINTER;

  NS_ASSERTION(MsgIsUTF8(aPath), "aPath is not in UTF-8");

  *aStateChanged = false;

  SubscribeTreeNode *node = nullptr;
  rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  NS_ASSERTION(node->isSubscribable, "fix this");
  if (!node->isSubscribable) {
    return NS_OK;
  }

  if (node->isSubscribed == aState) {
    return NS_OK;
  } else {
    node->isSubscribed = aState;
    *aStateChanged = true;

    // Repaint the tree row to show/clear the check mark.
    if (mTree) {
      bool dummy;
      int32_t index = GetRow(node, &dummy);
      if (index >= 0) mTree->InvalidateRow(index);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetSubscribeListener(nsISubscribeListener *aListener) {
  mSubscribeListener = aListener;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetSubscribeListener(nsISubscribeListener **aListener) {
  NS_ENSURE_ARG_POINTER(aListener);
  NS_IF_ADDREF(*aListener = mSubscribeListener);
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SubscribeCleanup() {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::StartPopulatingWithUri(nsIMsgWindow *aMsgWindow,
                                             bool aForceToServer,
                                             const char *uri) {
  mStopped = false;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::StartPopulating(nsIMsgWindow *aMsgWindow,
                                      bool aForceToServer,
                                      bool aGetOnlyNew /*ignored*/) {
  mStopped = false;

  nsresult rv = FreeRows();
  NS_ENSURE_SUCCESS(rv, rv);

  rv = FreeSubtree(mTreeRoot);
  mTreeRoot = nullptr;
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::StopPopulating(nsIMsgWindow *aMsgWindow) {
  mStopped = true;

  nsresult rv = FreeRows();
  NS_ENSURE_SUCCESS(rv, rv);

  if (mTreeRoot) {
    SubscribeTreeNode *node = mTreeRoot->lastChild;
    // Add top level items as closed.
    while (node) {
      node->isOpen = false;
      mRowMap.AppendElement(node);
      node = node->prevSibling;
    }

    // Invalidate the whole thing.
    if (mTree) mTree->RowCountChanged(0, mRowMap.Length());

    // Open all the top level items if they are containers.
    uint32_t topRows = mRowMap.Length();
    for (int32_t i = topRows - 1; i >= 0; i--) {
      bool isContainer = false;
      IsContainer(i, &isContainer);
      if (isContainer) ToggleOpenState(i);
    }
  }

  if (mSubscribeListener) mSubscribeListener->OnDonePopulating();

  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::UpdateSubscribed() {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::Subscribe(const char16_t *aName) {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::Unsubscribe(const char16_t *aName) {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::SetShowFullName(bool showFullName) {
  mShowFullName = showFullName;
  return NS_OK;
}

nsresult nsSubscribableServer::FreeSubtree(SubscribeTreeNode *node) {
  nsresult rv = NS_OK;

  if (node) {
    // recursively free the children
    if (node->firstChild) {
      // will free node->firstChild
      rv = FreeSubtree(node->firstChild);
      NS_ENSURE_SUCCESS(rv, rv);
      node->firstChild = nullptr;
    }

    // recursively free the siblings
    if (node->nextSibling) {
      // will free node->nextSibling
      rv = FreeSubtree(node->nextSibling);
      NS_ENSURE_SUCCESS(rv, rv);
      node->nextSibling = nullptr;
    }

#ifdef HAVE_SUBSCRIBE_DESCRIPTION
    NS_ASSERTION(node->description == nullptr,
                 "you need to free the description");
#endif
    free(node->name);
#if 0
    node->name = nullptr;
    node->parent = nullptr;
    node->lastChild = nullptr;
    node->cachedChild = nullptr;
#endif

    delete node;
  }

  return NS_OK;
}

nsresult nsSubscribableServer::FreeRows() {
  int32_t rowCount = mRowMap.Length();
  mRowMap.Clear();
  if (mTree) mTree->RowCountChanged(0, -rowCount);

  return NS_OK;
}

nsresult nsSubscribableServer::CreateNode(SubscribeTreeNode *parent,
                                          const char *name,
                                          const nsACString &aPath,
                                          SubscribeTreeNode **result) {
  NS_ASSERTION(result && name, "result or name is null");
  NS_ENSURE_ARG_POINTER(result);
  NS_ENSURE_ARG_POINTER(name);

  *result = new SubscribeTreeNode();
  if (!*result) return NS_ERROR_OUT_OF_MEMORY;

  (*result)->name = strdup(name);
  if (!(*result)->name) return NS_ERROR_OUT_OF_MEMORY;

  (*result)->path.Assign(aPath);

  (*result)->parent = parent;
  (*result)->prevSibling = nullptr;
  (*result)->nextSibling = nullptr;
  (*result)->firstChild = nullptr;
  (*result)->lastChild = nullptr;
  (*result)->isSubscribed = false;
  (*result)->isSubscribable = false;
#ifdef HAVE_SUBSCRIBE_DESCRIPTION
  (*result)->description = nullptr;
#endif
#ifdef HAVE_SUBSCRIBE_MESSAGES
  (*result)->messages = 0;
#endif
  (*result)->cachedChild = nullptr;

  if (parent) {
    parent->cachedChild = *result;
  }

  (*result)->isOpen = true;

  return NS_OK;
}

nsresult nsSubscribableServer::AddChildNode(SubscribeTreeNode *parent,
                                            const char *name,
                                            const nsACString &aPath,
                                            SubscribeTreeNode **child) {
  nsresult rv = NS_OK;
  NS_ASSERTION(parent && child && name && !aPath.IsEmpty(),
               "parent, child or name is null");
  if (!parent || !child || !name || aPath.IsEmpty())
    return NS_ERROR_NULL_POINTER;

  if (!parent->firstChild) {
    // CreateNode will set the parent->cachedChild
    rv = CreateNode(parent, name, aPath, child);
    NS_ENSURE_SUCCESS(rv, rv);

    parent->firstChild = *child;
    parent->lastChild = *child;

    return NS_OK;
  }

  if (parent->cachedChild) {
    if (strcmp(parent->cachedChild->name, name) == 0) {
      *child = parent->cachedChild;
      return NS_OK;
    }
  }

  SubscribeTreeNode *current = parent->firstChild;

  /*
   * Insert in reverse alphabetical order.
   * This will reduce the # of strcmps since this is faster assuming:
   *  1) the hostinfo.dat feeds us the groups in alphabetical order
   *     since we control the hostinfo.dat file, we can guarantee this.
   *  2) the server gives us the groups in alphabetical order
   *     we can't guarantee this, but it seems to be a common thing.
   *
   * Because we have firstChild, lastChild, nextSibling, prevSibling,
   * we can efficiently reverse the order when dumping to hostinfo.dat
   * or to GetTargets().
   */
  int32_t compare = strcmp(current->name, name);

  while (current && (compare != 0)) {
    if (compare < 0) {
      // CreateNode will set the parent->cachedChild
      rv = CreateNode(parent, name, aPath, child);
      NS_ENSURE_SUCCESS(rv, rv);

      (*child)->nextSibling = current;
      (*child)->prevSibling = current->prevSibling;
      current->prevSibling = (*child);
      if (!(*child)->prevSibling) {
        parent->firstChild = (*child);
      } else {
        (*child)->prevSibling->nextSibling = (*child);
      }

      return NS_OK;
    }
    current = current->nextSibling;
    if (current) {
      NS_ASSERTION(current->name, "no name!");
      compare = strcmp(current->name, name);
    } else {
      compare = -1;  // anything but 0, since that would be a match
    }
  }

  if (compare == 0) {
    // already exists;
    *child = current;

    // set the cachedChild
    parent->cachedChild = *child;
    return NS_OK;
  }

  // CreateNode will set the parent->cachedChild
  rv = CreateNode(parent, name, aPath, child);
  NS_ENSURE_SUCCESS(rv, rv);

  (*child)->prevSibling = parent->lastChild;
  (*child)->nextSibling = nullptr;
  parent->lastChild->nextSibling = *child;
  parent->lastChild = *child;

  return NS_OK;
}

nsresult nsSubscribableServer::FindAndCreateNode(const nsACString &aPath,
                                                 SubscribeTreeNode **aResult) {
  nsresult rv = NS_OK;
  NS_ASSERTION(aResult, "no result");
  NS_ENSURE_ARG_POINTER(aResult);

  if (!mTreeRoot) {
    // the root has no parent, and its name is server uri
    rv = CreateNode(nullptr, mIncomingServerUri.get(), EmptyCString(),
                    &mTreeRoot);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (aPath.IsEmpty()) {
    *aResult = mTreeRoot;
    return NS_OK;
  }

  *aResult = nullptr;

  SubscribeTreeNode *parent = mTreeRoot;
  SubscribeTreeNode *child = nullptr;

  uint32_t tokenStart = 0;
  // Special case paths that start with the hierarchy delimiter.
  // We want to include that delimiter in the first token name.
  // So start from position 1.
  int32_t tokenEnd = aPath.FindChar(mDelimiter, tokenStart + 1);
  while (true) {
    if (tokenEnd == kNotFound) {
      if (tokenStart >= aPath.Length()) break;
      tokenEnd = aPath.Length();
    }
    nsCString token(Substring(aPath, tokenStart, tokenEnd - tokenStart));
    rv = AddChildNode(parent, token.BeginReading(),
                      Substring(aPath, 0, tokenEnd), &child);
    if (NS_FAILED(rv)) return rv;
    tokenStart = tokenEnd + 1;
    tokenEnd = aPath.FindChar(mDelimiter, tokenStart);
    parent = child;
  }

  // the last child we add is the result
  *aResult = child;
  return rv;
}

NS_IMETHODIMP
nsSubscribableServer::HasChildren(const nsACString &aPath, bool *aHasChildren) {
  NS_ASSERTION(aHasChildren, "no hasChildren");
  NS_ENSURE_ARG_POINTER(aHasChildren);

  *aHasChildren = false;

  SubscribeTreeNode *node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  *aHasChildren = (node->firstChild != nullptr);
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsSubscribed(const nsACString &aPath,
                                   bool *aIsSubscribed) {
  NS_ENSURE_ARG_POINTER(aIsSubscribed);

  *aIsSubscribed = false;

  SubscribeTreeNode *node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  *aIsSubscribed = node->isSubscribed;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsSubscribable(const nsACString &aPath,
                                     bool *aIsSubscribable) {
  NS_ENSURE_ARG_POINTER(aIsSubscribable);

  *aIsSubscribable = false;

  SubscribeTreeNode *node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  *aIsSubscribable = node->isSubscribable;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetLeafName(const nsACString &aPath,
                                  nsAString &aLeafName) {
  SubscribeTreeNode *node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  // XXX TODO FIXME
  // I'm assuming that mShowFullName is true for NNTP, false for IMAP.
  // for imap, the node name is in modified UTF7
  // for news, the path is escaped UTF8
  //
  // when we switch to using the tree, this hack will go away.
  if (mShowFullName) {
    return NS_MsgDecodeUnescapeURLPath(aPath, aLeafName);
  }

  return CopyMUTF7toUTF16(nsDependentCString(node->name), aLeafName);
}

NS_IMETHODIMP
nsSubscribableServer::GetFirstChildURI(const nsACString &aPath,
                                       nsACString &aResult) {
  aResult.Truncate();

  SubscribeTreeNode *node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  // no children
  if (!node->firstChild) return NS_ERROR_FAILURE;

  aResult.Assign(node->firstChild->path);

  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetChildURIs(const nsACString &aPath,
                                   nsIUTF8StringEnumerator **aResult) {
  SubscribeTreeNode *node = nullptr;
  nsresult rv = FindAndCreateNode(aPath, &node);
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ASSERTION(node, "didn't find the node");
  if (!node) return NS_ERROR_FAILURE;

  NS_ASSERTION(mTreeRoot, "no tree root!");
  if (!mTreeRoot) return NS_ERROR_UNEXPECTED;

  // We inserted them in reverse alphabetical order.
  // So pull them out in reverse to get the right order
  // in the subscribe dialog.
  SubscribeTreeNode *current = node->lastChild;
  // return failure if there are no children.
  if (!current) return NS_ERROR_FAILURE;

  nsTArray<nsCString> *result = new nsTArray<nsCString>;

  while (current) {
    NS_ASSERTION(current->name, "no name");
    if (!current->name) return NS_ERROR_FAILURE;

    result->AppendElement(current->path);

    current = current->prevSibling;
  }

  rv = NS_NewAdoptingUTF8StringEnumerator(aResult, result);
  if (NS_FAILED(rv)) delete result;

  return rv;
}

NS_IMETHODIMP
nsSubscribableServer::CommitSubscribeChanges() {
  NS_ASSERTION(false, "override this.");
  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsSubscribableServer::SetSearchValue(const nsAString &aSearchValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsSubscribableServer::GetSupportsSubscribeSearch(bool *retVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsSubscribableServer::GetFolderView(nsITreeView **aView) {
  NS_ENSURE_ARG_POINTER(aView);
  return this->QueryInterface(NS_GET_IID(nsITreeView), (void **)aView);
}

int32_t nsSubscribableServer::GetRow(SubscribeTreeNode *node, bool *open) {
  int32_t parentRow = -1;
  if (node->parent) parentRow = GetRow(node->parent, open);

  // If the parent wasn't opened, we're not in the row map
  if (open && *open == false) return -1;

  if (open) *open = node->isOpen;

  for (uint32_t row = parentRow + 1; row < mRowMap.Length(); row++) {
    if (mRowMap[row] == node) return row;
  }

  // Apparently, we're not in the map
  return -1;
}

NS_IMETHODIMP
nsSubscribableServer::GetSelection(nsITreeSelection **selection) {
  NS_IF_ADDREF(*selection = mSelection);
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetSelection(nsITreeSelection *selection) {
  mSelection = selection;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetRowCount(int32_t *rowCount) {
  *rowCount = mRowMap.Length();
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetTree(mozilla::dom::XULTreeElement *aTree) {
  mTree = aTree;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsContainer(int32_t aIndex, bool *retval) {
  *retval = !!mRowMap[aIndex]->firstChild;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsContainerEmpty(int32_t aIndex, bool *retval) {
  *retval = false;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsContainerOpen(int32_t aIndex, bool *retval) {
  *retval = mRowMap[aIndex]->isOpen;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetParentIndex(int32_t aIndex, int32_t *retval) {
  SubscribeTreeNode *parent = mRowMap[aIndex]->parent;
  if (!parent) {
    *retval = -1;
    return NS_OK;
  }

  int32_t index;
  for (index = aIndex - 1; index >= 0; index--) {
    if (mRowMap[index] == parent) {
      *retval = index;
      return NS_OK;
    }
  }
  *retval = -1;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::HasNextSibling(int32_t aRowIndex, int32_t aAfterIndex,
                                     bool *retval) {
  // This looks odd, but is correct. Using ->nextSibling gives a bad tree.
  *retval = !!mRowMap[aRowIndex]->prevSibling;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetLevel(int32_t aIndex, int32_t *retval) {
  // When starting with -2, we increase twice and return 0 for a top level node.
  int32_t level = -2;
  SubscribeTreeNode *node = mRowMap[aIndex];
  while (node) {
    node = node->parent;
    level++;
  }

  *retval = level;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::ToggleOpenState(int32_t aIndex) {
  SubscribeTreeNode *node = mRowMap[aIndex];
  if (node->isOpen) {
    node->isOpen = false;

    // Remove subtree by deleting elements from array up to next sibling.
    int32_t count = 0;
    do {
      // Find next sibling or the beginning of the next subtree.
      if (node->prevSibling) {
        count = mRowMap.IndexOf(node->prevSibling, aIndex) - aIndex - 1;
      } else {
        node = node->parent;
        // When node reaches the root, delete the rest of the array.
        if (!node->parent) {
          count = mRowMap.Length() - aIndex - 1;
        }
      }
    } while (!count && node->parent);
    mRowMap.RemoveElementsAt(aIndex + 1, count);
    if (mTree) {
      mTree->RowCountChanged(aIndex + 1, -count);
      mTree->InvalidateRow(aIndex);
    }
  } else {
    // Recursively add the children nodes (i.e., remember open)
    node->isOpen = true;
    int32_t total = 0;
    node = node->lastChild;
    while (node) {
      total += AddSubtree(node, aIndex + 1 + total);
      node = node->prevSibling;
    }
    if (mTree) {
      mTree->RowCountChanged(aIndex + 1, total);
      mTree->InvalidateRow(aIndex);
    }
  }
  return NS_OK;
}

int32_t nsSubscribableServer::AddSubtree(SubscribeTreeNode *node,
                                         int32_t index) {
  mRowMap.InsertElementAt(index, node);
  int32_t total = 1;
  if (node->isOpen) {
    node = node->lastChild;
    while (node) {
      total += AddSubtree(node, index + total);
      node = node->prevSibling;
    }
  }
  return total;
}

NS_IMETHODIMP
nsSubscribableServer::GetCellText(int32_t aRow, nsTreeColumn *aCol,
                                  nsAString &retval) {
  nsString colId;
  aCol->GetId(colId);
  if (colId.EqualsLiteral("nameColumn")) {
    nsCString path(mRowMap[aRow]->path);
    GetLeafName(path, retval);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetCellValue(int32_t aRow, nsTreeColumn *aCol,
                                   nsAString &retval) {
  nsString colId;
  aCol->GetId(colId);
  if (colId.EqualsLiteral("nameColumn"))
    retval = NS_ConvertUTF8toUTF16(mRowMap[aRow]->path);
  if (colId.EqualsLiteral("subscribedColumn")) {
    retval = mRowMap[aRow]->isSubscribed ? NS_LITERAL_STRING("true")
                                         : NS_LITERAL_STRING("false");
  }
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetCellText(int32_t aRow, nsTreeColumn *aCol,
                                  const nsAString &aText) {
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::SetCellValue(int32_t aRow, nsTreeColumn *aCol,
                                   const nsAString &aText) {
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetCellProperties(int32_t aRow, nsTreeColumn *aCol,
                                        nsAString &aProps) {
  SubscribeTreeNode *node = mRowMap[aRow];
  if (node->isSubscribable)
    aProps.AssignLiteral("subscribable-true");
  else
    aProps.AssignLiteral("subscribable-false");

  nsString colId;
  aCol->GetId(colId);
  if (colId.EqualsLiteral("subscribedColumn")) {
    if (node->isSubscribed)
      aProps.AppendLiteral(" subscribed-true");
    else
      aProps.AppendLiteral(" subscribed-false");
  } else if (colId.EqualsLiteral("nameColumn")) {
    aProps.AppendLiteral(" serverType-");
    aProps.Append(NS_ConvertUTF8toUTF16(mServerType));
  }
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetRowProperties(int32_t aRow, nsAString &aProps) {
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetColumnProperties(nsTreeColumn *aCol,
                                          nsAString &aProps) {
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsEditable(int32_t aRow, nsTreeColumn *aCol,
                                 bool *retval) {
  *retval = false;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsSeparator(int32_t aRowIndex, bool *retval) {
  *retval = false;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::IsSorted(bool *retval) {
  *retval = false;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::CanDrop(int32_t aIndex, int32_t aOrientation,
                              mozilla::dom::DataTransfer *aData, bool *retval) {
  *retval = false;
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::Drop(int32_t aRow, int32_t aOrientation,
                           mozilla::dom::DataTransfer *aData) {
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::GetImageSrc(int32_t aRow, nsTreeColumn *aCol,
                                  nsAString &retval) {
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::CycleHeader(nsTreeColumn *aCol) { return NS_OK; }

NS_IMETHODIMP
nsSubscribableServer::SelectionChangedXPCOM() { return NS_OK; }

NS_IMETHODIMP
nsSubscribableServer::CycleCell(int32_t aRow, nsTreeColumn *aCol) {
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::PerformAction(const char16_t *aAction) { return NS_OK; }

NS_IMETHODIMP
nsSubscribableServer::PerformActionOnRow(const char16_t *aAction,
                                         int32_t aRow) {
  return NS_OK;
}

NS_IMETHODIMP
nsSubscribableServer::PerformActionOnCell(const char16_t *aAction, int32_t aRow,
                                          nsTreeColumn *aCol) {
  return NS_OK;
}
