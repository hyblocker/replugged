const { resolve } = require('path');
const { Plugin } = require('powercord/entities');
const { WEBSITE } = require('powercord/constants');
const { inject, uninject } = require('powercord/injector');
const { React, getModuleByDisplayName, getModule } = require('powercord/webpack');

const GeneralSettings = require('./components/GeneralSettings.jsx');

module.exports = class Settings extends Plugin {
  startPlugin () {
    this.registerSettings('pc-general', 'General Settings', powercord.settings.connectStore(GeneralSettings), false);

    this.loadCSS(resolve(__dirname, 'style.scss'));
    this.patchSettingsComponent();
    this.patchExperiments();
    this.patchSelfXSS();

    if (this.settings.get('__experimental_2019-12-16', false)) {
      this.log('Experimental Settings enabled.');
      this.patchSettingsContextMenu();
    }
  }

  async pluginWillUnload () {
    uninject('pc-settings-items');
    uninject('pc-settings-actions');
    uninject('pc-settings-errorHandler');

    const i18n = await getModule([ 'Messages' ]);
    i18n.Messages = i18n._Messages;
  }

  async patchExperiments () {
    try {
      const experimentsModule = await getModule(r => r.isDeveloper !== void 0);
      Object.defineProperty(experimentsModule, 'isDeveloper', {
        get: () => powercord.settings.get('experiments', false)
      });

      // Ensure components do get the update
      experimentsModule._changeCallbacks.forEach(cb => cb());
    } catch (_) {
      // memes
    }
  }

  async patchSettingsComponent () {
    const SettingsView = await getModuleByDisplayName('SettingsView');
    inject('pc-settings-items', SettingsView.prototype, 'getPredicateSections', (args, sections) => {
      const changelog = sections.find(c => c.section === 'changelog');
      if (changelog) {
        sections.splice(
          sections.indexOf(changelog), 0,
          {
            section: 'HEADER',
            label: 'Powercord'
          },
          ...powercord.api.settings.tabs,
          { section: 'DIVIDER' }
        );
      }

      if (sections.find(c => c.section === 'CUSTOM')) {
        sections.find(c => c.section === 'CUSTOM').element = ((_element) => function () {
          const res = _element();
          if (res.props.children && res.props.children.length === 3) {
            res.props.children.unshift(
              Object.assign({}, res.props.children[0], {
                props: Object.assign({}, res.props.children[0].props, {
                  href: WEBSITE,
                  title: 'Powercord',
                  className: `${res.props.children[0].props.className} powercord-pc-icon`
                })
              })
            );
          }
          return res;
        })(sections.find(c => c.section === 'CUSTOM').element);
      }

      return sections;
    });
  }

  async patchSettingsContextMenu () {
    const SubMenuItem = await getModuleByDisplayName('FluxContainer(SubMenuItem)');
    const ImageMenuItem = await getModuleByDisplayName('ImageMenuItem');
    const SettingsContextMenu = await getModuleByDisplayName('UserSettingsCogContextMenu');
    inject('pc-settings-actions', SettingsContextMenu.prototype, 'render', (args, res) => {
      const parent = React.createElement(SubMenuItem, {
        label: 'Powercord',
        render: () => powercord.api.settings.tabs.map(tab => React.createElement(ImageMenuItem, {
          label: tab.label,
          action: async () => {
            const settingsModule = await getModule([ 'open', 'saveAccountChanges' ]);
            settingsModule.open(tab.section);
          }
        }))
      });

      parent.key = 'Powercord';

      const items = res.props.children.find(child => Array.isArray(child));
      const changelog = items.find(item => item && item.key === 'changelog');
      if (changelog) {
        items.splice(items.indexOf(changelog), 0, parent);
      } else {
        this.error('Unable to locate \'Change Log\' item; forcing element to context menu!');

        res.props.children.push(parent);
      }

      return res;
    });
  }

  async patchSelfXSS () {
    const i18n = await getModule([ 'Messages' ]);
    i18n._Messages = i18n.Messages;
    i18n.Messages = new Proxy(i18n._Messages, {
      get: (obj, prop) => {
        if (prop === 'SELF_XSS_HEADER' && powercord.settings.get('yeetSelfXSS', false)) {
          return null;
        }
        return obj[prop];
      }
    });
  }

  __toggleExperimental () {
    const current = this.settings.get('__experimental_2019-12-16', false);
    if (!current) {
      this.warn('WARNING: This will enable the new and experimental settings context menu, that is NOT functional yet.');
      this.warn('WARNING: Powercord Staff won\'t accept bug reports from this experimental version, nor provide support!');
      this.warn('WARNING: Use it at your own risk! It\'s labeled experimental for a reason.');
    } else {
      this.log('Experimental Settings disabled.');
    }
    this.settings.set('__experimental_2019-12-16', !current);
    powercord.pluginManager.remount(this.entityID);
  }
};
