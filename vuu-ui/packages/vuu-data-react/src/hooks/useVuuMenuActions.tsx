import {
  ContextMenuItemDescriptor,
  DataSource,
  DataSourceVisualLinkCreatedMessage,
  MenuActionHandler,
  MenuBuilder,
  MenuRpcResponse,
  RpcResponse,
  RpcResponseHandler,
} from "@finos/vuu-data-types";
import { useDialogContext, type MenuActionClosePopup } from "@finos/vuu-popups";
import type {
  LinkDescriptorWithLabel,
  VuuMenu,
  VuuMenuItem,
} from "@finos/vuu-protocol-types";
import {
  VuuServerMenuOptions,
  buildMenuDescriptorFromVuuMenu,
  getMenuRpcRequest,
  isGroupMenuItemDescriptor,
  isRoot,
  isTableLocation,
} from "@finos/vuu-utils";
import { useCallback } from "react";
import { BulkEditPanel } from "@finos/vuu-table";

export const addRowsFromInstruments = "addRowsFromInstruments";

const NO_CONFIG: MenuActionConfig = {};

export type VuuMenuActionHandler = (type: string, options: unknown) => boolean;

export interface ViewServerHookResult {
  buildViewserverMenuOptions: MenuBuilder;
  handleMenuAction: MenuActionHandler;
}

export interface MenuActionConfig {
  vuuMenu?: VuuMenu;
  visualLink?: DataSourceVisualLinkCreatedMessage;
  visualLinks?: LinkDescriptorWithLabel[];
}

export interface VuuMenuActionHookProps {
  /**
   * By default, vuuMenuActions will be handled automatically. When activated, a
   * message will be sent to server and response will be handled here too.
   * This prop allows client to provide a custom handler for a menu Item. This will
   * take priority and if handler returns true, no further processing for the menu
   * item will be handled by Vuu. This can also be used to prevent an item from being
   * actioned, even when no custom handling is intended. If the handler returns false,
   * Vuu will process the menuItem.
   */
  clientSideMenuActionHandler?: VuuMenuActionHandler;
  dataSource: DataSource;
  menuActionConfig?: MenuActionConfig;
  onRpcResponse?: RpcResponseHandler;
}

export const useVuuMenuActions = ({
  clientSideMenuActionHandler,
  dataSource,
  menuActionConfig = NO_CONFIG,
  onRpcResponse,
}: VuuMenuActionHookProps): ViewServerHookResult => {
  const buildViewserverMenuOptions: MenuBuilder = useCallback(
    (location, options) => {
      const { links, menu } = dataSource;
      const { visualLink } = menuActionConfig;
      const descriptors: ContextMenuItemDescriptor[] = [];

      if (location === "grid" && links && !visualLink) {
        links.forEach((linkDescriptor: LinkDescriptorWithLabel) => {
          const { link, label: linkLabel } = linkDescriptor;
          const label = linkLabel ? linkLabel : link.toTable;
          descriptors.push({
            label: `Link to ${label}`,
            action: "link-table",
            options: linkDescriptor,
          });
        });
      }

      if (menu && isTableLocation(location)) {
        const menuDescriptor = buildMenuDescriptorFromVuuMenu(
          menu,
          location,
          options as VuuServerMenuOptions
        );
        if (isRoot(menu) && isGroupMenuItemDescriptor(menuDescriptor)) {
          descriptors.push(...menuDescriptor.children);
        } else if (menuDescriptor) {
          descriptors.push(menuDescriptor);
        }
      }

      return descriptors;
    },
    [dataSource, menuActionConfig]
  );

  const { showDialog, closeDialog } = useDialogContext();
  const handleSubmit = useCallback(() => {
    dataSource.rpcCall?.({
      namedParams: {},
      params: ["1"],
      rpcName: "SAVE_BULK_EDITS",
      type: "VIEW_PORT_RPC_CALL",
    });
    closeDialog();
  }, [closeDialog, dataSource]);
  const handleMenuAction = useCallback(
    ({ menuId, options }: MenuActionClosePopup) => {
      if (clientSideMenuActionHandler?.(menuId, options)) {
        return true;
      } else if (menuId === "MENU_RPC_CALL") {
        const rpcRequest = getMenuRpcRequest(options as unknown as VuuMenuItem);

        dataSource.menuRpcCall(rpcRequest).then((rpcResponse) => {
          if (onRpcResponse && rpcResponse) {
            onRpcResponse && onRpcResponse(rpcResponse);
          }

          if ((rpcResponse as MenuRpcResponse).rpcName === "OPEN_BULK_EDITS") {
            showDialog(
              <BulkEditPanel
                response={rpcResponse as RpcResponse}
                onClose={closeDialog}
                onSubmit={handleSubmit}
                dataSource={dataSource}
              />,
              "Edit Instruments"
            );

            // TODO: Create and pass sessionDs from here
            // const sessionDs =
            //   dataSource.createSessionDataSource?.("sessionTable1");
            // if (sessionDs) {
            //   showDialog(
            //     <BulkEditPanel
            //       // response={rpcResponse as RpcResponse}
            //       setDialogClose={closeDialog}
            //       dataSource={dataSource}
            //       sessionDataSource={sessionDs}
            //     />,
            //     "Edit Instruments"
            //   );

            return true;
          }
        });
        return true;
      } else if (menuId === "link-table") {
        // return dataSource.createLink(options as LinkDescriptorWithLabel), true;
        return (
          (dataSource.visualLink = options as LinkDescriptorWithLabel), true
        );
      } else {
        console.log(
          `useViewServer handleMenuAction,  can't handle action type ${menuId}`
        );
      }

      return false;
    },
    [
      clientSideMenuActionHandler,
      closeDialog,
      dataSource,
      handleSubmit,
      onRpcResponse,
      showDialog,
    ]
  );

  return {
    buildViewserverMenuOptions,
    handleMenuAction,
  };
};
