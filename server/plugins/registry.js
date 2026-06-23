const logPlugin = require('./logPlugin');
const compositeDeletePlugin = require('./compositeDeletePlugin');
const sfdxApexPlugin = require('./sfdxApexPlugin');
const shareCalculatorPlugin = require('./shareCalculatorPlugin');

const PLUGINS = [logPlugin, compositeDeletePlugin, sfdxApexPlugin, shareCalculatorPlugin];
const pluginMap = new Map(PLUGINS.map(p => [p.getName(), p]));

function getPlugin(name) {
  const p = pluginMap.get(name);
  if (!p) throw new Error(`Plugin not found: ${name}`);
  return p;
}

function getPlugins(names) {
  return (names || []).map(n => getPlugin(n));
}

function listPluginInfo() {
  return PLUGINS.map(p => ({
    name: p.getName(),
    version: p.getVersion(),
    description: p.getDescription(),
  }));
}

module.exports = { getPlugin, getPlugins, listPluginInfo };
