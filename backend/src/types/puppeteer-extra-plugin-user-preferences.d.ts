declare module 'puppeteer-extra-plugin-user-preferences' {
  import { PuppeteerExtraPlugin } from 'puppeteer-extra';

  interface UserPreferencesPluginOptions {
    userPrefs?: Record<string, unknown>;
  }

  function UserPreferencesPlugin(options?: UserPreferencesPluginOptions): PuppeteerExtraPlugin;

  export = UserPreferencesPlugin;
}
