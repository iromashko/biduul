import { PackageJson } from 'type-fest';
import { listenChange } from 'use-change';
import Noty from 'noty';
import { Layout } from 'react-grid-layout';

import * as api from '../api';
import notify from '../lib/notify';
import settings from '../settings';
import { Plugin } from './types';
import { PriceLinesDatum } from '../lib/CandlestickChart/types';

interface WidgetData {
  hasSettings: boolean;
  element: HTMLElement;
  settingsElement: HTMLElement | null;
  id: string;
  title: string;
  pluginId: string;
  layout?: Partial<Pick<Layout, 'w' | 'h' | 'x' | 'y' | 'minH' | 'minW' | 'maxH' | 'maxW'>>;
  noPadding?: boolean;
  bodyClassName?: string;
  shouldCheckAccount?: boolean;
  isWidgetInitiallyEnabled: boolean;
  currentScript: HTMLOrSVGScriptElement;
  listenSettingsSave: (handler: () => void) => (() => void);
  listenSettingsCancel: (handler: () => void) => (() => void);
  listenIsWidgetEnabled: (handler: (isEnabled: boolean) => void) => (() => void);
  listenWidgetDestroy: (handler: () => void) => (() => void);
  onSettingsSave: () => void;
  onSettingsCancel: () => void;
  onSetEnabled: (isEnabled: boolean) => void;
  onDestroy: () => void;
}

interface PluginInfo {
  name: string;
  id: string;
  version: string | null;
  description: string;
  main: string | null;
  isDefault: boolean;
  isThirdParty: boolean;
  isDevelopment: boolean;
}

type WidgetId = 'chart' | 'trading' | 'positionAndOrders' | 'lastTrades' | 'orderBook' | 'wallet';

export default class App {
  public defaultPlugins: PluginInfo[] = [];

  public customPlugins: PluginInfo[] = [];

  public customPriceLines: PriceLinesDatum[] = [];

  #pluginCache: Record<string, PluginInfo> = {};

  public readonly builtInWidgets: { id: WidgetId, title: string; }[] = [
    { id: 'chart', title: 'Chart' },
    { id: 'trading', title: 'Trading' },
    { id: 'positionAndOrders', title: 'Positions & Orders' },
    { id: 'lastTrades', title: 'Last Trades' },
    { id: 'orderBook', title: 'Order Book' },
    { id: 'wallet', title: 'Wallet' },
  ];

  public pluginWidgets: WidgetData[] = [];

  public arePluginsLoading = false;

  public didPluginsInitialized = false;

  #store: Store;

  constructor(store: Store) {
    this.#store = store;

    // make api be available globally
    window.biduulPlugin = ((plugin: Plugin<Store>): void => {
      plugin(this.#store, api);
    }) as typeof window.biduulPlugin;

    // call initial promise
    void this.#init();
  }

  // fetches plugins information and loads enabled plugins scripts
  #init = async (): Promise<void> => {
    const store = this.#store;
    const reloadPlugins = async (pluginsEnabled: string[]): Promise<void> => {
      const defaultPluginNames = settings.defaultPlugins.map(({ id }) => id);
      this.arePluginsLoading = true;

      this.customPlugins = await Promise.all(
        pluginsEnabled.filter((id) => !defaultPluginNames.includes(id))
          .map((id) => this.#getPluginInfo({
            id,
            isDefault: false,
            isThirdParty: true,
          })),
      );

      this.arePluginsLoading = false;
    };

    // first, load information about default plugins
    // it's going to be done only once after the app is loaded
    await Promise.all(
      settings.defaultPlugins.map(({ id, isThirdParty }) => this.#getPluginInfo({
        id,
        isDefault: true,
        isThirdParty,
      })),
    ).then((defaultPlugins) => {
      this.defaultPlugins = defaultPlugins;
    });

    // load information about custom plugins, and make it every time when pluginsEnabled is changed
    listenChange(store.persistent, 'pluginsEnabled', reloadPlugins);
    await reloadPlugins(store.persistent.pluginsEnabled);

    // load all plugin scripts
    await Promise.all(
      [...this.defaultPlugins, ...this.customPlugins].map(async ({ version, main, id }) => {
        const isEnabled = store.persistent.pluginsEnabled.includes(id);

        if (isEnabled && main) {
          try {
            await this.#loadPluginScript({ id, main, version });
          } catch {
            notify('error', `Unable to load plugin script "${id}"`);
          }
        }
      }),
    );

    this.didPluginsInitialized = true;
  };

  public createWidget = ({
    hasSettings = false,
    id,
    title,
    layout,
    noPadding,
    bodyClassName,
    shouldCheckAccount,
    currentScript,
  }: {
    hasSettings: boolean;
    id: string;
    title: string;
    layout: Layout,
    noPadding?: boolean;
    bodyClassName?: string;
    shouldCheckAccount?: boolean;
    currentScript: HTMLOrSVGScriptElement;
  }): Omit<WidgetData, 'onSettingsSave' | 'onSettingsCancel' | 'onSetEnabled' | 'onDestroy'> => {
    try {
      const { pluginId } = currentScript.dataset;
      const existingPluginWidget = this.pluginWidgets.find((w) => w.id === id);
      const existingBuiltInWidget = this.builtInWidgets.find((w) => w.id === id);
      const { persistent } = this.#store;

      if (!pluginId) throw new Error('Plugin script does not provide pluginId');
      if (!currentScript) throw new Error('Widget Error: currentScript is required');
      if (!id) throw new Error('Widget Error: id is required');
      if (!title) throw new Error('Widget Error: title is required');
      if (existingPluginWidget) throw new Error(`Widget with ID "${id}" initialized twice (at plugins "${pluginId}" and "${existingPluginWidget?.pluginId}")`);
      if (existingBuiltInWidget) throw new Error(`Widget with ID "${id}" already exists as default widget. Please remove plugin "${pluginId}".`);

      // the element is going to be rendered as widget content
      const element = document.createElement('div');
      // settings element is going to be rendered at settings content
      // which appeares when user clicks widget settings icon
      const settingsElement = hasSettings ? document.createElement('div') : null;
      const isWidgetInitiallyEnabled = !persistent.widgetsDisabled.includes(id);

      // the code is a trick that allows to return functions similar to addEventListener
      // example: listenSettingsSave(() => console.log('settings saved'))
      const eventTarget = {
        saveCount: 0, cancelCount: 0, isEnabled: isWidgetInitiallyEnabled, isPluginEnabled: true,
      };
      const listenSettingsSave = (handler: () => void) => listenChange(eventTarget, 'saveCount', () => handler());
      const listenSettingsCancel = (handler: () => void) => listenChange(eventTarget, 'cancelCount', () => handler());
      const listenIsWidgetEnabled = (handler: (isEnabled: boolean) => void) => listenChange(eventTarget, 'isEnabled', handler);
      const listenWidgetDestroy = (handler: () => void) => listenChange(eventTarget, 'isPluginEnabled', () => handler());
      const onSettingsSave = () => { eventTarget.saveCount += 1; };
      const onSettingsCancel = () => { eventTarget.cancelCount += 1; };
      const onSetEnabled = (isEnabled: boolean) => { eventTarget.isEnabled = isEnabled; };
      const onDestroy = () => { eventTarget.isPluginEnabled = false; };

      const widgetData: Omit<WidgetData, 'onSettingsSave' | 'onSettingsCancel' | 'onSetEnabled' | 'onDestroy'> = {
        pluginId,
        element,
        settingsElement,
        hasSettings,
        id,
        title,
        layout,
        noPadding,
        bodyClassName,
        shouldCheckAccount,
        isWidgetInitiallyEnabled,
        currentScript,
        listenSettingsSave,
        listenSettingsCancel,
        listenIsWidgetEnabled,
        listenWidgetDestroy,
      };

      listenChange(persistent, 'widgetsDisabled', () => {
        onSetEnabled(!persistent.widgetsDisabled.includes(id));
      });

      this.pluginWidgets = [
        ...this.pluginWidgets,
        {
          ...widgetData, onSettingsSave, onSettingsCancel, onSetEnabled, onDestroy,
        },
      ];

      return widgetData;
    } catch (e) {
      notify('error', e);
      throw e;
    }
  };

  #getPluginInfo = async ({ id, isThirdParty, isDefault }: {
    id: string;
    isThirdParty: boolean;
    isDefault: boolean;
  }): Promise<PluginInfo> => {
    // if this is a directy injected script, then
    // use an imaginary package.json with improvised name and desccription
    if (id.startsWith('http://') || id.startsWith('https://')) {
      return {
        name: 'Development',
        id,
        version: null,
        description: `Development script ${id}`,
        main: id,
        isDefault,
        isThirdParty: true,
        isDevelopment: true,
      };
    }

    if (this.#pluginCache[id]) {
      return this.#pluginCache[id];
    }

    try {
      // fetch package info
      const request = await fetch(`https://unpkg.com/${id}/package.json`);
      const pkg = await request.json() as PackageJson;
      const pluginInfo: PluginInfo = {
        id,
        name: id,
        version: pkg.version as string,
        description: pkg.description ?? '',
        main: pkg.main ?? 'index.js',
        isDefault,
        isThirdParty,
        isDevelopment: false,
      };

      this.#pluginCache[id] = pluginInfo;

      return pluginInfo;
    } catch {
      // if script is unable to fetch the package, thow error and return
      // an imaginary package.json with improvised name and desccription
      const error = `Unable to fetch package info for plugin "${id}"`;
      notify('error', error);
      return {
        id,
        name: 'Error',
        version: null,
        main: null,
        description: error,
        isDefault,
        isThirdParty,
        isDevelopment: false,
      };
    }
  };

  #loadPluginScript = async ({
    version,
    id,
    main,
  }: {
    version: string | null;
    id: string;
    main: string;
  }): Promise<void> => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const src = main.startsWith('http://') || main.startsWith('https://')
      ? main
      : `https://unpkg.com/${id}${version ? `@${version}` : ''}/${main}`;
    script.setAttribute('src', src);
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject());

    // allows to detect a plugin that created one or another widget
    script.dataset.pluginId = id;
    document.body.appendChild(script);
  });

  public enablePlugin = async (
    id: string, { isDefault, isThirdParty }: { isDefault: boolean; isThirdParty: boolean },
  ): Promise<void> => {
    try {
      const { persistent } = this.#store;
      const existing = this.customPlugins.find(((p) => p.id === id));

      if (existing) throw new Error(`Plugin with ID "${id}" already exists`);

      // fetch plugin info
      const { main, version } = await this.#getPluginInfo({ id, isThirdParty, isDefault });

      // if "main" key is there (ensure for TypeScript, thought it's not required for the app)
      // then load the plugin itself
      if (main) {
        try {
          await this.#loadPluginScript({ id, main, version });
          // add the plugin to the list of enabled plugins
          persistent.pluginsEnabled = [...persistent.pluginsEnabled, id];
        } catch (e) {
          notify('error', `Unable to load plugin script "${id}"`);

          throw e;
        }
      }
    } catch (e) {
      notify('error', e);
      throw e;
    }
  };

  public disablePlugin = (id: string): void => {
    const { persistent } = this.#store;
    const plugin = [...this.defaultPlugins, ...this.customPlugins].find(((p) => p.id === id));

    // remove plugin from enabled list
    persistent.pluginsEnabled = persistent.pluginsEnabled.filter((i) => i !== id);

    // makes sure that TypeScript detects plugin as non-undefined
    if (!plugin) throw new Error(`Unable to disable an unknown plugin "${id}"`);

    // disable widgets created by the plugin
    for (const { pluginId, id: widgetId, onDestroy } of this.pluginWidgets) {
      if (pluginId === id) {
        persistent.widgetsDisabled = persistent.widgetsDisabled.filter((w) => w !== widgetId);
        onDestroy();
      }
    }

    this.pluginWidgets = this.pluginWidgets.filter(({ pluginId }) => pluginId !== id);

    // warn user that they need to reload the app to get rid of any side effects of the plugin
    if (!plugin.isDefault || plugin.isThirdParty) {
      const noty = new Noty({
        text: 'The third-party plugin is disabled. In order to make it completely deleted and get rid of any potential side effects you can reload the application by clicking the "Reload" button.',
        type: 'success',
        layout: 'bottomRight',
        timeout: 10_000,
        buttons: [
          Noty.button('Reload', 'btn btn-primary', () => {
            window.location.reload();
          }),
          Noty.button('Skip', 'btn btn-success float-end', () => {
            noty.close();
          }),
        ],
      });
      noty.show();
    }
  };
}
