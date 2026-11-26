const path = require("node:path");
const { pathToFileURL } = require("node:url");

module.exports = async function boot(serverPath) {
  return import(pathToFileURL(serverPath).href);
};
