import { isLayoutJSON, resolveJSONPath } from "@finos/vuu-layout";
import { useNotifications } from "@finos/vuu-popups";
import {
  logger,
  type ApplicationJSON,
  type ApplicationSetting,
  type ApplicationSettings,
  type LayoutJSON,
} from "@finos/vuu-utils";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePersistenceManager } from "../persistence-manager";
import {
  defaultApplicationJson,
  getDefaultApplicationLayout,
  loadingApplicationJson,
} from "./defaultApplicationJson";
import { LayoutMetadata, LayoutMetadataDto } from "./layoutTypes";

const { info } = logger("useLayoutManager");

export const LayoutManagementContext = React.createContext<{
  layoutMetadata: LayoutMetadata[];
  saveLayout: (n: LayoutMetadataDto) => void;
  applicationJson: ApplicationJSON;
  saveApplicationLayout: (layout: LayoutJSON) => void;
  getApplicationSettings: (
    key?: keyof ApplicationSettings
  ) => ApplicationSettings | ApplicationSetting | undefined;
  saveApplicationSettings: (
    settings: ApplicationSettings | ApplicationSetting,
    key?: keyof ApplicationSettings
  ) => void;
  loadLayoutById: (id: string) => void;
}>({
  getApplicationSettings: () => undefined,
  layoutMetadata: [],
  saveLayout: () => undefined,
  // The default Application JSON will be served if no LayoutManagementProvider
  applicationJson: defaultApplicationJson,
  saveApplicationLayout: () => undefined,
  saveApplicationSettings: () => undefined,
  loadLayoutById: () => undefined,
});

type LayoutManagementProviderProps = {
  children: JSX.Element | JSX.Element[];
  defaultLayout?: LayoutJSON;
};

const ensureLayoutHasTitle = (
  layout: LayoutJSON,
  layoutMetadata: LayoutMetadataDto
) => {
  if (layout.props?.title !== undefined) {
    return layout;
  } else {
    return {
      ...layout,
      props: {
        ...layout.props,
        title: layoutMetadata.name,
      },
    };
  }
};

/**
 * LayoutManagementProvider supplies an API for loading and saving layout documents.
 * Initial layout is automatically loaded on startup. Because this hook is responsible
 * only for loading and saving layouts, it only triggers a render when content is loaded.
 *
 * Initial layout displays a loading state
 * User may supply a default layout. This will not be displayed until call has been made to
 * persistenceManager to retrieve stored layout state. If no stored state is returned, the
 * default layout provided by user will be set as current state (and hence rendered). If no
 * default layout has been provided by user, the sysem default will be used (simple PlaceHolder)
 * If saved layout state has been returned, that will be set as current state (and rendered)
 *
 */
export const LayoutManagementProvider = ({
  defaultLayout,
  ...props
}: LayoutManagementProviderProps) => {
  const [layoutMetadata, setLayoutMetadata] = useState<LayoutMetadata[]>([]);
  // TODO this default should probably be a loading state rather than the placeholder
  // It will be replaced as soon as the localStorage/remote layout is resolved
  const [, forceRefresh] = useState({});
  const notify = useNotifications();
  const persistenceManager = usePersistenceManager();
  const applicationJSONRef = useRef<ApplicationJSON>(loadingApplicationJson);

  const setApplicationJSON = useCallback(
    (applicationJSON: ApplicationJSON, rerender = true) => {
      applicationJSONRef.current = applicationJSON;
      if (rerender) {
        forceRefresh({});
      }
    },
    []
  );

  const setApplicationLayout = useCallback(
    (layout: LayoutJSON, rerender = true) => {
      setApplicationJSON(
        {
          ...applicationJSONRef.current,
          layout,
        },
        rerender
      );
    },
    [setApplicationJSON]
  );

  const setApplicationSettings = useCallback(
    (settings: ApplicationSettings) => {
      setApplicationJSON(
        {
          ...applicationJSONRef.current,
          settings: {
            ...applicationJSONRef.current.settings,
            ...settings,
          },
        },
        false
      );
    },
    [setApplicationJSON]
  );

  useEffect(() => {
    persistenceManager
      ?.loadMetadata()
      .then((metadata) => {
        setLayoutMetadata(metadata);
      })
      .catch((error: Error) => {
        notify({
          type: "error",
          header: "Failed to Load Layouts",
          body: "Could not load list of available layouts",
        });
        console.error("Error occurred while retrieving metadata", error);
      });

    persistenceManager
      ?.loadApplicationJSON()
      .then((applicationJSON?: ApplicationJSON) => {
        if (applicationJSON) {
          info?.("applicationJSON loaded successfully");
          setApplicationJSON(applicationJSON);
        } else {
          const layout = getDefaultApplicationLayout(defaultLayout);
          info?.(`applicationJSON not found, getting defaultApplicationLayout,
            ${JSON.stringify(layout, null, 2)}
            `);
          setApplicationJSON({
            layout,
          });
        }
      })
      .catch((error: Error) => {
        notify({
          type: "error",
          header: "Failed to Load Layout",
          body: "Could not load your latest view",
        });
        console.error(
          "Error occurred while retrieving application layout",
          error
        );
      });
  }, [defaultLayout, notify, persistenceManager, setApplicationJSON]);

  const saveApplicationLayout = useCallback(
    (layout: LayoutJSON) => {
      if (isLayoutJSON(layout)) {
        setApplicationLayout(layout, false);
        persistenceManager?.saveApplicationJSON(applicationJSONRef.current);
      } else {
        console.error("Tried to save invalid application layout", layout);
      }
    },
    [persistenceManager, setApplicationLayout]
  );

  const saveLayout = useCallback(
    (metadata: LayoutMetadataDto) => {
      let layoutToSave: LayoutJSON | undefined;
      try {
        layoutToSave = resolveJSONPath(
          applicationJSONRef.current.layout,
          "#main-tabs.ACTIVE_CHILD"
        );
      } catch (e) {
        // ignore, code below will handle
      }

      if (layoutToSave && isLayoutJSON(layoutToSave)) {
        persistenceManager
          ?.createLayout(metadata, ensureLayoutHasTitle(layoutToSave, metadata))
          .then((metadata) => {
            notify({
              type: "success",
              header: "Layout Saved Successfully",
              body: `${metadata.name} saved successfully`,
            });
            setLayoutMetadata((prev) => [...prev, metadata]);
          })
          .catch((error: Error) => {
            notify({
              type: "error",
              header: "Failed to Save Layout",
              body: `Failed to save layout ${metadata.name}`,
            });
            console.error("Error occurred while saving layout", error);
          });
      } else {
        console.error("Tried to save invalid layout", layoutToSave);
        notify({
          type: "error",
          header: "Failed to Save Layout",
          body: "Cannot save invalid layout",
        });
      }
    },
    [notify, persistenceManager]
  );

  const saveApplicationSettings = useCallback(
    (
      settings: ApplicationSettings | ApplicationSetting,
      key?: keyof ApplicationSettings
    ) => {
      const { settings: applicationSettings } = applicationJSONRef.current;
      if (key) {
        setApplicationSettings({
          ...applicationSettings,
          [key]: settings,
        });
      } else {
        setApplicationSettings(settings as ApplicationSettings);
      }
      persistenceManager?.saveApplicationJSON(applicationJSONRef.current);
    },
    [persistenceManager, setApplicationSettings]
  );

  const getApplicationSettings = useCallback(
    (key?: keyof ApplicationSettings) => {
      const { settings } = applicationJSONRef.current;
      return key ? settings?.[key] : settings;
    },
    []
  );

  const loadLayoutById = useCallback(
    (id: string) => {
      persistenceManager
        ?.loadLayout(id)
        .then((layoutJson) => {
          const { layout: currentLayout } = applicationJSONRef.current;
          setApplicationLayout({
            ...currentLayout,
            children: (currentLayout.children || []).concat(layoutJson),
            props: {
              ...currentLayout.props,
              active: currentLayout.children?.length ?? 0,
            },
          });
        })
        .catch((error: Error) => {
          notify({
            type: "error",
            header: "Failed to Load Layout",
            body: "Failed to load the requested layout",
          });
          console.error("Error occurred while loading layout", error);
        });
    },
    [notify, persistenceManager, setApplicationLayout]
  );

  return (
    <LayoutManagementContext.Provider
      value={{
        getApplicationSettings,
        layoutMetadata,
        saveLayout,
        applicationJson: applicationJSONRef.current,
        saveApplicationLayout,
        saveApplicationSettings,
        loadLayoutById,
      }}
    >
      {props.children}
    </LayoutManagementContext.Provider>
  );
};

export const useLayoutManager = () => useContext(LayoutManagementContext);
