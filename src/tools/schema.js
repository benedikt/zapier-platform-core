'use strict';

const _ = require('lodash');
const cleaner = require('./cleaner');
const dataTools = require('./data');
const zapierSchema = require('zapier-platform-schema');

// Take a resource with methods like list/hook and turn it into triggers, etc.
const convertResourceDos = (appRaw) => {
  let triggers = {}, searches = {}, creates = {};

  _.each(appRaw.resources, (resource) => {
    if (resource.hook && resource.hook.operation) {
      let trigger = dataTools.deepCopy(resource.hook);
      trigger.key = `${resource.key}Hook`;
      trigger.noun = resource.noun;
      trigger.operation.resource = resource.key;
      trigger.operation.type = 'hook';
      triggers[trigger.key] = trigger;
    }

    if (resource.list && resource.list.operation) {
      let trigger = dataTools.deepCopy(resource.list);
      trigger.key = `${resource.key}List`;
      trigger.noun = resource.noun;
      trigger.operation.resource = resource.key;
      trigger.operation.type = 'polling';
      triggers[trigger.key] = trigger;
    }

    if (resource.search && resource.search.operation) {
      let search = dataTools.deepCopy(resource.search);
      search.key = `${resource.key}Search`;
      search.noun = resource.noun;
      search.operation.resource = resource.key;
      searches[search.key] = search;
    }

    if (resource.create && resource.create.operation) {
      let create = dataTools.deepCopy(resource.create);
      create.key = `${resource.key}Create`;
      create.noun = resource.noun;
      create.operation.resource = resource.key;
      creates[create.key] = create;
    }

    // TODO: search or create?
  });

  return { triggers, searches, creates };
};

/* When a trigger/search/create (action) links to a resource, we walk up to
 * the resource and copy missing properties from resource to the action.
 */
const copyPropertiesFromResource = (type, action, appRaw) => {
  if (appRaw.resources && action.operation && appRaw.resources[action.operation.resource]) {
    const copyableProperties = ['outputFields', 'sample'];
    const resource = appRaw.resources[action.operation.resource];

    if (type === 'trigger' && action.operation.type === 'hook') {
      if (_.get(resource, 'list.operation.perform')) {
        action.operation.performList = action.operation.performList || resource.list.operation.perform;
      }
    } else if (type === 'search' || type === 'create') {
      if (_.get(resource, 'get.operation.perform')) {
        action.operation.performGet = action.operation.performGet || resource.get.operation.perform;
      }
    }

    _.extend(action.operation, _.pick(resource, copyableProperties));
  }

  return action;
};

const compileApp = (appRaw) => {
  appRaw = dataTools.deepCopy(appRaw);
  const extras = convertResourceDos(appRaw);

  appRaw.triggers = _.extend({}, extras.triggers, appRaw.triggers || {});
  appRaw.searches = _.extend({}, extras.searches, appRaw.searches || {});
  appRaw.creates = _.extend({}, extras.creates, appRaw.creates || {});

  _.each(appRaw.triggers, (trigger) => {
    appRaw.triggers[trigger.key] = copyPropertiesFromResource('trigger', trigger, appRaw);
  });

  _.each(appRaw.searches, (search) => {
    appRaw.searches[search.key] = copyPropertiesFromResource('search', search, appRaw);
  });

  _.each(appRaw.creates, (create) => {
    appRaw.creates[create.key] = copyPropertiesFromResource('create', create, appRaw);
  });

  return appRaw;
};

const serializeApp = (compiledApp) => {
  const cleanedApp = cleaner.recurseCleanFuncs(compiledApp);
  return dataTools.jsonCopy(cleanedApp);
};

const validateApp = (compiledApp) => {
  const cleanedApp = cleaner.recurseCleanFuncs(compiledApp);
  const results = zapierSchema.validateAppDefinition(cleanedApp);
  return dataTools.jsonCopy(results.errors);
};

const prepareApp = (appRaw) => {
  const compiledApp = compileApp(appRaw);
  return dataTools.deepFreeze(compiledApp);
};

module.exports = {
  compileApp,
  validateApp,
  serializeApp,
  prepareApp
};
