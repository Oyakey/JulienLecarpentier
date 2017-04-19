(function(){ 
"use strict";

/*!
 * @overview  Ember Data
 * @copyright Copyright 2011-2016 Tilde Inc. and contributors.
 *            Portions Copyright 2011 LivingSocial Inc.
 * @license   Licensed under MIT license (see license.js)
 * @version   2.10.0
 */

var loader, define, requireModule, require, requirejs;

(function(global) {
  'use strict';

  var stats;

  // Save off the original values of these globals, so we can restore them if someone asks us to
  var oldGlobals = {
    loader: loader,
    define: define,
    requireModule: requireModule,
    require: require,
    requirejs: requirejs
  };

  requirejs = require = requireModule = function(name) {
    stats.require++;
    var pending = [];
    var mod = findModule(name, '(require)', pending);

    for (var i = pending.length - 1; i >= 0; i--) {
      pending[i].exports();
    }

    return mod.module.exports;
  };

  function resetStats() {
    stats = {
      define: 0,
      require: 0,
      reify: 0,
      findDeps: 0,
      modules: 0,
      exports: 0,
      resolve: 0,
      resolveRelative: 0,
      findModule: 0,
      pendingQueueLength: 0
    };
    requirejs._stats = stats;
  }


  resetStats();

  loader = {
    noConflict: function(aliases) {
      var oldName, newName;

      for (oldName in aliases) {
        if (aliases.hasOwnProperty(oldName)) {
          if (oldGlobals.hasOwnProperty(oldName)) {
            newName = aliases[oldName];

            global[newName] = global[oldName];
            global[oldName] = oldGlobals[oldName];
          }
        }
      }
    }
  };

  var _isArray;
  if (!Array.isArray) {
    _isArray = function (x) {
      return Object.prototype.toString.call(x) === '[object Array]';
    };
  } else {
    _isArray = Array.isArray;
  }

  var registry = {};
  var seen = {};

  var uuid = 0;

  function unsupportedModule(length) {
    throw new Error('an unsupported module was defined, expected `define(name, deps, module)` instead got: `' +
                    length + '` arguments to define`');
  }

  var defaultDeps = ['require', 'exports', 'module'];

  function Module(name, deps, callback, alias) {
    stats.modules++;
    this.id        = uuid++;
    this.name      = name;
    this.deps      = !deps.length && callback.length ? defaultDeps : deps;
    this.module    = { exports: {} };
    this.callback  = callback;
    this.finalized = false;
    this.hasExportsAsDep = false;
    this.isAlias = alias;
    this.reified = new Array(deps.length);
    this._foundDeps = false;
    this.isPending = false;
  }

  Module.prototype.makeDefaultExport = function() {
    var exports = this.module.exports;
    if (exports !== null &&
        (typeof exports === 'object' || typeof exports === 'function') &&
          exports['default'] === undefined) {
      exports['default'] = exports;
    }
  };

  Module.prototype.exports = function() {
    if (this.finalized) { return this.module.exports; }
    stats.exports++;

    this.finalized = true;
    this.isPending = false;

    if (loader.wrapModules) {
      this.callback = loader.wrapModules(this.name, this.callback);
    }

    this.reify();

    var result = this.callback.apply(this, this.reified);

    if (!(this.hasExportsAsDep && result === undefined)) {
      this.module.exports = result;
    }
    this.makeDefaultExport();
    return this.module.exports;
  };

  Module.prototype.unsee = function() {
    this.finalized = false;
    this._foundDeps = false;
    this.isPending = false;
    this.module = { exports: {} };
  };

  Module.prototype.reify = function() {
    stats.reify++;
    var reified = this.reified;
    for (var i = 0; i < reified.length; i++) {
      var mod = reified[i];
      reified[i] = mod.exports ? mod.exports : mod.module.exports();
    }
  };

  Module.prototype.findDeps = function(pending) {
    if (this._foundDeps) {
      return;
    }

    stats.findDeps++;
    this._foundDeps = true;
    this.isPending = true;

    var deps = this.deps;

    for (var i = 0; i < deps.length; i++) {
      var dep = deps[i];
      var entry = this.reified[i] = { exports: undefined, module: undefined };
      if (dep === 'exports') {
        this.hasExportsAsDep = true;
        entry.exports = this.module.exports;
      } else if (dep === 'require') {
        entry.exports = this.makeRequire();
      } else if (dep === 'module') {
        entry.exports = this.module;
      } else {
        entry.module = findModule(resolve(dep, this.name), this.name, pending);
      }
    }
  };

  Module.prototype.makeRequire = function() {
    var name = this.name;
    var r = function(dep) {
      return require(resolve(dep, name));
    };
    r['default'] = r;
    r.has = function(dep) {
      return has(resolve(dep, name));
    };
    return r;
  };

  define = function(name, deps, callback) {
    stats.define++;
    if (arguments.length < 2) {
      unsupportedModule(arguments.length);
    }

    if (!_isArray(deps)) {
      callback = deps;
      deps     =  [];
    }

    if (callback instanceof Alias) {
      registry[name] = new Module(callback.name, deps, callback, true);
    } else {
      registry[name] = new Module(name, deps, callback, false);
    }
  };

  // we don't support all of AMD
  // define.amd = {};
  // we will support petals...
  define.petal = { };

  function Alias(path) {
    this.name = path;
  }

  define.alias = function(path) {
    return new Alias(path);
  };

  function missingModule(name, referrer) {
    throw new Error('Could not find module `' + name + '` imported from `' + referrer + '`');
  }

  function findModule(name, referrer, pending) {
    stats.findModule++;
    var mod = registry[name] || registry[name + '/index'];

    while (mod && mod.isAlias) {
      mod = registry[mod.name];
    }

    if (!mod) { missingModule(name, referrer); }

    if (pending && !mod.finalized && !mod.isPending) {
      mod.findDeps(pending);
      pending.push(mod);
      stats.pendingQueueLength++;
    }
    return mod;
  }

  function resolve(child, name) {
    stats.resolve++;
    if (child.charAt(0) !== '.') { return child; }
    stats.resolveRelative++;

    var parts = child.split('/');
    var nameParts = name.split('/');
    var parentBase = nameParts.slice(0, -1);

    for (var i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];

      if (part === '..') {
        if (parentBase.length === 0) {
          throw new Error('Cannot access parent module of root');
        }
        parentBase.pop();
      } else if (part === '.') {
        continue;
      } else { parentBase.push(part); }
    }

    return parentBase.join('/');
  }

  function has(name) {
    return !!(registry[name] || registry[name + '/index']);
  }

  requirejs.entries = requirejs._eak_seen = registry;
  requirejs.has = has;
  requirejs.unsee = function(moduleName) {
    findModule(moduleName, '(unsee)', false).unsee();
  };

  requirejs.clear = function() {
    resetStats();
    requirejs.entries = requirejs._eak_seen = registry = {};
    seen = {};
  };

  // prime
  define('foo',      function() {});
  define('foo/bar',  [], function() {});
  define('foo/asdf', ['module', 'exports', 'require'], function(module, exports, require) {
    if (require.has('foo/bar')) {
      require('foo/bar');
    }
  });
  define('foo/baz',  [], define.alias('foo'));
  define('foo/quz',  define.alias('foo'));
  define('foo/bar',  ['foo', './quz', './baz', './asdf', './bar', '../foo'], function() {});
  define('foo/main', ['foo/bar'], function() {});

  require('foo/main');
  require.unsee('foo/bar');

  requirejs.clear();

  if (typeof exports === 'object' && typeof module === 'object' && module.exports) {
    module.exports = { require: require, define: define };
  }
})(this);

define("ember-data/-private/adapters", ["exports", "ember-data/adapters/json-api", "ember-data/adapters/rest"], function (exports, _emberDataAdaptersJsonApi, _emberDataAdaptersRest) {
  exports.JSONAPIAdapter = _emberDataAdaptersJsonApi.default;
  exports.RESTAdapter = _emberDataAdaptersRest.default;
});
/**
  @module ember-data
*/
define('ember-data/-private/adapters/build-url-mixin', ['exports', 'ember'], function (exports, _ember) {

  var get = _ember.default.get;

  /**
  
    WARNING: This interface is likely to change in order to accomodate https://github.com/emberjs/rfcs/pull/4
  
    ## Using BuildURLMixin
  
    To use url building, include the mixin when extending an adapter, and call `buildURL` where needed.
    The default behaviour is designed for RESTAdapter.
  
    ### Example
  
    ```javascript
    export default DS.Adapter.extend(BuildURLMixin, {
      findRecord: function(store, type, id, snapshot) {
        var url = this.buildURL(type.modelName, id, snapshot, 'findRecord');
        return this.ajax(url, 'GET');
      }
    });
    ```
  
    ### Attributes
  
    The `host` and `namespace` attributes will be used if defined, and are optional.
  
    @class BuildURLMixin
    @namespace DS
  */
  exports.default = _ember.default.Mixin.create({
    /**
      Builds a URL for a given type and optional ID.
       By default, it pluralizes the type's name (for example, 'post'
      becomes 'posts' and 'person' becomes 'people'). To override the
      pluralization see [pathForType](#method_pathForType).
       If an ID is specified, it adds the ID to the path generated
      for the type, separated by a `/`.
       When called by RESTAdapter.findMany() the `id` and `snapshot` parameters
      will be arrays of ids and snapshots.
       @method buildURL
      @param {String} modelName
      @param {(String|Array|Object)} id single id or array of ids or query
      @param {(DS.Snapshot|Array)} snapshot single snapshot or array of snapshots
      @param {String} requestType
      @param {Object} query object of query parameters to send for query requests.
      @return {String} url
    */
    buildURL: function (modelName, id, snapshot, requestType, query) {
      switch (requestType) {
        case 'findRecord':
          return this.urlForFindRecord(id, modelName, snapshot);
        case 'findAll':
          return this.urlForFindAll(modelName, snapshot);
        case 'query':
          return this.urlForQuery(query, modelName);
        case 'queryRecord':
          return this.urlForQueryRecord(query, modelName);
        case 'findMany':
          return this.urlForFindMany(id, modelName, snapshot);
        case 'findHasMany':
          return this.urlForFindHasMany(id, modelName, snapshot);
        case 'findBelongsTo':
          return this.urlForFindBelongsTo(id, modelName, snapshot);
        case 'createRecord':
          return this.urlForCreateRecord(modelName, snapshot);
        case 'updateRecord':
          return this.urlForUpdateRecord(id, modelName, snapshot);
        case 'deleteRecord':
          return this.urlForDeleteRecord(id, modelName, snapshot);
        default:
          return this._buildURL(modelName, id);
      }
    },

    /**
      @method _buildURL
      @private
      @param {String} modelName
      @param {String} id
      @return {String} url
    */
    _buildURL: function (modelName, id) {
      var url = [];
      var host = get(this, 'host');
      var prefix = this.urlPrefix();
      var path;

      if (modelName) {
        path = this.pathForType(modelName);
        if (path) {
          url.push(path);
        }
      }

      if (id) {
        url.push(encodeURIComponent(id));
      }
      if (prefix) {
        url.unshift(prefix);
      }

      url = url.join('/');
      if (!host && url && url.charAt(0) !== '/') {
        url = '/' + url;
      }

      return url;
    },

    /**
     Builds a URL for a `store.findRecord(type, id)` call.
      Example:
      ```app/adapters/user.js
     import DS from 'ember-data';
      export default DS.JSONAPIAdapter.extend({
       urlForFindRecord(id, modelName, snapshot) {
         let baseUrl = this.buildURL();
         return `${baseUrl}/users/${snapshot.adapterOptions.user_id}/playlists/${id}`;
       }
     });
     ```
      @method urlForFindRecord
     @param {String} id
     @param {String} modelName
     @param {DS.Snapshot} snapshot
     @return {String} url
      */
    urlForFindRecord: function (id, modelName, snapshot) {
      return this._buildURL(modelName, id);
    },

    /**
     Builds a URL for a `store.findAll(type)` call.
      Example:
      ```app/adapters/comment.js
     import DS from 'ember-data';
      export default DS.JSONAPIAdapter.extend({
       urlForFindAll(id, modelName, snapshot) {
         return 'data/comments.json';
       }
     });
     ```
      @method urlForFindAll
     @param {String} modelName
     @param {DS.SnapshotRecordArray} snapshot
     @return {String} url
     */
    urlForFindAll: function (modelName, snapshot) {
      return this._buildURL(modelName);
    },

    /**
     Builds a URL for a `store.query(type, query)` call.
      Example:
      ```app/adapters/application.js
     import DS from 'ember-data';
      export default DS.RESTAdapter.extend({
       host: 'https://api.github.com',
       urlForQuery (query, modelName) {
         switch(modelName) {
           case 'repo':
             return `https://api.github.com/orgs/${query.orgId}/repos`;
           default:
             return this._super(...arguments);
         }
       }
     });
     ```
      @method urlForQuery
     @param {Object} query
     @param {String} modelName
     @return {String} url
     */
    urlForQuery: function (query, modelName) {
      return this._buildURL(modelName);
    },

    /**
     Builds a URL for a `store.queryRecord(type, query)` call.
      Example:
      ```app/adapters/application.js
     import DS from 'ember-data';
      export default DS.RESTAdapter.extend({
       urlForQueryRecord({ slug }, modelName) {
         let baseUrl = this.buildURL();
         return `${baseUrl}/${encodeURIComponent(slug)}`;
       }
     });
     ```
      @method urlForQueryRecord
     @param {Object} query
     @param {String} modelName
     @return {String} url
     */
    urlForQueryRecord: function (query, modelName) {
      return this._buildURL(modelName);
    },

    /**
     Builds a URL for coalesceing multiple `store.findRecord(type, id)
     records into 1 request when the adapter's `coalesceFindRequests`
     property is true.
      Example:
      ```app/adapters/application.js
     import DS from 'ember-data';
      export default DS.RESTAdapter.extend({
       urlForFindMany(ids, modelName) {
         let baseUrl = this.buildURL();
         return `${baseUrl}/coalesce`;
       }
     });
     ```
      @method urlForFindMany
     @param {Array} ids
     @param {String} modelName
     @param {Array} snapshots
     @return {String} url
     */
    urlForFindMany: function (ids, modelName, snapshots) {
      return this._buildURL(modelName);
    },

    /**
     Builds a URL for fetching a async hasMany relationship when a url
     is not provided by the server.
      Example:
      ```app/adapters/application.js
     import DS from 'ember-data';
      export default DS.JSONAPIAdapter.extend({
       urlForFindHasMany(id, modelName, snapshot) {
         let baseUrl = this.buildURL(id, modelName);
         return `${baseUrl}/relationships`;
       }
     });
     ```
      @method urlForFindHasMany
     @param {String} id
     @param {String} modelName
     @param {DS.Snapshot} snapshot
     @return {String} url
     */
    urlForFindHasMany: function (id, modelName, snapshot) {
      return this._buildURL(modelName, id);
    },

    /**
     Builds a URL for fetching a async belongsTo relationship when a url
     is not provided by the server.
      Example:
      ```app/adapters/application.js
     import DS from 'ember-data';
      export default DS.JSONAPIAdapter.extend({
       urlForFindBelongsTo(id, modelName, snapshot) {
         let baseUrl = this.buildURL(id, modelName);
         return `${baseUrl}/relationships`;
       }
     });
     ```
      @method urlForFindBelongsTo
     @param {String} id
     @param {String} modelName
     @param {DS.Snapshot} snapshot
     @return {String} url
     */
    urlForFindBelongsTo: function (id, modelName, snapshot) {
      return this._buildURL(modelName, id);
    },

    /**
     Builds a URL for a `record.save()` call when the record was created
     locally using `store.createRecord()`.
      Example:
      ```app/adapters/application.js
     import DS from 'ember-data';
      export default DS.RESTAdapter.extend({
       urlForCreateRecord(modelName, snapshot) {
         return this._super(...arguments) + '/new';
       }
     });
     ```
      @method urlForCreateRecord
     @param {String} modelName
     @param {DS.Snapshot} snapshot
     @return {String} url
     */
    urlForCreateRecord: function (modelName, snapshot) {
      return this._buildURL(modelName);
    },

    /**
     Builds a URL for a `record.save()` call when the record has been update locally.
      Example:
      ```app/adapters/application.js
     import DS from 'ember-data';
      export default DS.RESTAdapter.extend({
       urlForUpdateRecord(id, modelName, snapshot) {
         return `/${id}/feed?access_token=${snapshot.adapterOptions.token}`;
       }
     });
     ```
      @method urlForUpdateRecord
     @param {String} id
     @param {String} modelName
     @param {DS.Snapshot} snapshot
     @return {String} url
     */
    urlForUpdateRecord: function (id, modelName, snapshot) {
      return this._buildURL(modelName, id);
    },

    /**
     Builds a URL for a `record.save()` call when the record has been deleted locally.
      Example:
      ```app/adapters/application.js
     import DS from 'ember-data';
      export default DS.RESTAdapter.extend({
       urlForDeleteRecord(id, modelName, snapshot) {
         return this._super(...arguments) + '/destroy';
       }
     });
     ```
      * @method urlForDeleteRecord
     * @param {String} id
     * @param {String} modelName
     * @param {DS.Snapshot} snapshot
     * @return {String} url
     */
    urlForDeleteRecord: function (id, modelName, snapshot) {
      return this._buildURL(modelName, id);
    },

    /**
      @method urlPrefix
      @private
      @param {String} path
      @param {String} parentURL
      @return {String} urlPrefix
    */
    urlPrefix: function (path, parentURL) {
      var host = get(this, 'host');
      var namespace = get(this, 'namespace');

      if (!host || host === '/') {
        host = '';
      }

      if (path) {
        // Protocol relative url
        if (/^\/\//.test(path) || /http(s)?:\/\//.test(path)) {
          // Do nothing, the full host is already included.
          return path;

          // Absolute path
        } else if (path.charAt(0) === '/') {
            return '' + host + path;
            // Relative path
          } else {
              return parentURL + '/' + path;
            }
      }

      // No path provided
      var url = [];
      if (host) {
        url.push(host);
      }
      if (namespace) {
        url.push(namespace);
      }
      return url.join('/');
    },

    /**
      Determines the pathname for a given type.
       By default, it pluralizes the type's name (for example,
      'post' becomes 'posts' and 'person' becomes 'people').
       ### Pathname customization
       For example if you have an object LineItem with an
      endpoint of "/line_items/".
       ```app/adapters/application.js
      import DS from 'ember-data';
       export default DS.RESTAdapter.extend({
        pathForType: function(modelName) {
          var decamelized = Ember.String.decamelize(modelName);
          return Ember.String.pluralize(decamelized);
        }
      });
      ```
       @method pathForType
      @param {String} modelName
      @return {String} path
    **/
    pathForType: function (modelName) {
      var camelized = _ember.default.String.camelize(modelName);
      return _ember.default.String.pluralize(camelized);
    }
  });
});
define('ember-data/-private/core', ['exports', 'ember', 'ember-data/version'], function (exports, _ember, _emberDataVersion) {

  /**
    @module ember-data
  */

  /**
    All Ember Data classes, methods and functions are defined inside of this namespace.
  
    @class DS
    @static
  */

  /**
    @property VERSION
    @type String
    @static
  */
  var DS = _ember.default.Namespace.create({
    VERSION: _emberDataVersion.default,
    name: "DS"
  });

  if (_ember.default.libraries) {
    _ember.default.libraries.registerCoreLibrary('Ember Data', DS.VERSION);
  }

  exports.default = DS;
});
define('ember-data/-private/debug', ['exports', 'ember'], function (exports, _ember) {
  exports.assert = assert;
  exports.debug = debug;
  exports.deprecate = deprecate;
  exports.info = info;
  exports.runInDebug = runInDebug;
  exports.instrument = instrument;
  exports.warn = warn;
  exports.debugSeal = debugSeal;
  exports.assertPolymorphicType = assertPolymorphicType;

  function assert() {
    return _ember.default.assert.apply(_ember.default, arguments);
  }

  function debug() {
    return _ember.default.debug.apply(_ember.default, arguments);
  }

  function deprecate() {
    return _ember.default.deprecate.apply(_ember.default, arguments);
  }

  function info() {
    return _ember.default.info.apply(_ember.default, arguments);
  }

  function runInDebug() {
    return _ember.default.runInDebug.apply(_ember.default, arguments);
  }

  function instrument(method) {
    return method();
  }

  function warn() {
    return _ember.default.warn.apply(_ember.default, arguments);
  }

  function debugSeal() {
    return _ember.default.debugSeal.apply(_ember.default, arguments);
  }

  function checkPolymorphic(typeClass, addedRecord) {
    if (typeClass.__isMixin) {
      //TODO Need to do this in order to support mixins, should convert to public api
      //once it exists in Ember
      return typeClass.__mixin.detect(addedRecord.type.PrototypeMixin);
    }
    if (_ember.default.MODEL_FACTORY_INJECTIONS) {
      typeClass = typeClass.superclass;
    }
    return typeClass.detect(addedRecord.type);
  }

  /*
    Assert that `addedRecord` has a valid type so it can be added to the
    relationship of the `record`.
  
    The assert basically checks if the `addedRecord` can be added to the
    relationship (specified via `relationshipMeta`) of the `record`.
  
    This utility should only be used internally, as both record parameters must
    be an InternalModel and the `relationshipMeta` needs to be the meta
    information about the relationship, retrieved via
    `record.relationshipFor(key)`.
  
    @method assertPolymorphicType
    @param {InternalModel} record
    @param {RelationshipMeta} relationshipMeta retrieved via
           `record.relationshipFor(key)`
    @param {InternalModel} addedRecord record which
           should be added/set for the relationship
  */

  function assertPolymorphicType(record, relationshipMeta, addedRecord) {
    var addedType = addedRecord.type.modelName;
    var recordType = record.type.modelName;
    var key = relationshipMeta.key;
    var typeClass = record.store.modelFor(relationshipMeta.type);

    var assertionMessage = 'You cannot add a record of type \'' + addedType + '\' to the \'' + recordType + '.' + key + '\' relationship (only \'' + typeClass.modelName + '\' allowed)';

    assert(assertionMessage, checkPolymorphic(typeClass, addedRecord));
  }
});
define('ember-data/-private/ext/date', ['exports', 'ember', 'ember-data/-private/debug'], function (exports, _ember, _emberDataPrivateDebug) {

  /**
     Date.parse with progressive enhancement for ISO 8601 <https://github.com/csnover/js-iso8601>
  
     Â© 2011 Colin Snover <http://zetafleet.com>
  
     Released under MIT license.
  
     @class Date
     @namespace Ember
     @static
     @deprecated
  */
  _ember.default.Date = _ember.default.Date || {};

  var origParse = Date.parse;
  var numericKeys = [1, 4, 5, 6, 7, 10, 11];

  var parseDate = function (date) {
    var timestamp, struct;
    var minutesOffset = 0;

    // ES5 Â§15.9.4.2 states that the string should attempt to be parsed as a Date Time String Format string
    // before falling back to any implementation-specific date parsing, so thatâ€™s what we do, even if native
    // implementations could be faster
    //              1 YYYY                2 MM       3 DD           4 HH    5 mm       6 ss        7 msec        8 Z 9 Â±    10 tzHH    11 tzmm
    if (struct = /^(\d{4}|[+\-]\d{6})(?:-(\d{2})(?:-(\d{2}))?)?(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?(?:(Z)|([+\-])(\d{2})(?:(\d{2}))?)?)?$/.exec(date)) {
      // avoid NaN timestamps caused by â€œundefinedâ€ values being passed to Date.UTC
      for (var i = 0, k; k = numericKeys[i]; ++i) {
        struct[k] = +struct[k] || 0;
      }

      // allow undefined days and months
      struct[2] = (+struct[2] || 1) - 1;
      struct[3] = +struct[3] || 1;

      if (struct[8] !== 'Z' && struct[9] !== undefined) {
        minutesOffset = struct[10] * 60 + struct[11];

        if (struct[9] === '+') {
          minutesOffset = 0 - minutesOffset;
        }
      }

      timestamp = Date.UTC(struct[1], struct[2], struct[3], struct[4], struct[5] + minutesOffset, struct[6], struct[7]);
    } else {
      timestamp = origParse ? origParse(date) : NaN;
    }

    return timestamp;
  };

  exports.parseDate = parseDate;
  _ember.default.Date.parse = function (date) {

    return parseDate(date);

    // throw deprecation
  };

  if (_ember.default.EXTEND_PROTOTYPES === true || _ember.default.EXTEND_PROTOTYPES.Date) {
    Date.parse = parseDate;
  }
});
/**
  @module ember-data
*/
define('ember-data/-private/features', ['exports', 'ember'], function (exports, _ember) {
  exports.default = isEnabled;

  function isEnabled() {
    var _Ember$FEATURES;

    return (_Ember$FEATURES = _ember.default.FEATURES).isEnabled.apply(_Ember$FEATURES, arguments);
  }
});
define('ember-data/-private/global', ['exports'], function (exports) {
  /* globals global, window, self */

  // originally from https://github.com/emberjs/ember.js/blob/c0bd26639f50efd6a03ee5b87035fd200e313b8e/packages/ember-environment/lib/global.js

  // from lodash to catch fake globals
  function checkGlobal(value) {
    return value && value.Object === Object ? value : undefined;
  }

  // element ids can ruin global miss checks
  function checkElementIdShadowing(value) {
    return value && value.nodeType === undefined ? value : undefined;
  }

  // export real global
  exports.default = checkGlobal(checkElementIdShadowing(typeof global === 'object' && global)) || checkGlobal(typeof self === 'object' && self) || checkGlobal(typeof window === 'object' && window) || new Function('return this')();
  // eval outside of strict mode
});
define("ember-data/-private/initializers/data-adapter", ["exports", "ember-data/-private/system/debug/debug-adapter"], function (exports, _emberDataPrivateSystemDebugDebugAdapter) {
  exports.default = initializeDebugAdapter;

  /*
    Configures a registry with injections on Ember applications
    for the Ember-Data store. Accepts an optional namespace argument.
  
    @method initializeDebugAdapter
    @param {Ember.Registry} registry
  */

  function initializeDebugAdapter(registry) {
    registry.register('data-adapter:main', _emberDataPrivateSystemDebugDebugAdapter.default);
  }
});
define('ember-data/-private/initializers/store-injections', ['exports'], function (exports) {
  exports.default = initializeStoreInjections;
  /*
    Configures a registry with injections on Ember applications
    for the Ember-Data store. Accepts an optional namespace argument.
  
    @method initializeStoreInjections
    @param {Ember.Registry} registry
  */

  function initializeStoreInjections(registry) {
    // registry.injection for Ember < 2.1.0
    // application.inject for Ember 2.1.0+
    var inject = registry.inject || registry.injection;
    inject.call(registry, 'controller', 'store', 'service:store');
    inject.call(registry, 'route', 'store', 'service:store');
    inject.call(registry, 'data-adapter', 'store', 'service:store');
  }
});
define("ember-data/-private/initializers/store", ["exports", "ember-data/-private/system/store", "ember-data/-private/serializers", "ember-data/-private/adapters"], function (exports, _emberDataPrivateSystemStore, _emberDataPrivateSerializers, _emberDataPrivateAdapters) {
  exports.default = initializeStore;

  function has(applicationOrRegistry, fullName) {
    if (applicationOrRegistry.has) {
      // < 2.1.0
      return applicationOrRegistry.has(fullName);
    } else {
      // 2.1.0+
      return applicationOrRegistry.hasRegistration(fullName);
    }
  }

  /*
    Configures a registry for use with an Ember-Data
    store. Accepts an optional namespace argument.
  
    @method initializeStore
    @param {Ember.Registry} registry
  */

  function initializeStore(registry) {
    // registry.optionsForType for Ember < 2.1.0
    // application.registerOptionsForType for Ember 2.1.0+
    var registerOptionsForType = registry.registerOptionsForType || registry.optionsForType;
    registerOptionsForType.call(registry, 'serializer', { singleton: false });
    registerOptionsForType.call(registry, 'adapter', { singleton: false });

    registry.register('serializer:-default', _emberDataPrivateSerializers.JSONSerializer);
    registry.register('serializer:-rest', _emberDataPrivateSerializers.RESTSerializer);
    registry.register('adapter:-rest', _emberDataPrivateAdapters.RESTAdapter);

    registry.register('adapter:-json-api', _emberDataPrivateAdapters.JSONAPIAdapter);
    registry.register('serializer:-json-api', _emberDataPrivateSerializers.JSONAPISerializer);

    if (!has(registry, 'service:store')) {
      registry.register('service:store', _emberDataPrivateSystemStore.default);
    }
  }
});
define('ember-data/-private/initializers/transforms', ['exports', 'ember-data/-private/transforms'], function (exports, _emberDataPrivateTransforms) {
  exports.default = initializeTransforms;

  /*
    Configures a registry for use with Ember-Data
    transforms.
  
    @method initializeTransforms
    @param {Ember.Registry} registry
  */

  function initializeTransforms(registry) {
    registry.register('transform:boolean', _emberDataPrivateTransforms.BooleanTransform);
    registry.register('transform:date', _emberDataPrivateTransforms.DateTransform);
    registry.register('transform:number', _emberDataPrivateTransforms.NumberTransform);
    registry.register('transform:string', _emberDataPrivateTransforms.StringTransform);
  }
});
define('ember-data/-private/instance-initializers/initialize-store-service', ['exports'], function (exports) {
  exports.default = initializeStoreService;
  /*
   Configures a registry for use with an Ember-Data
   store.
  
   @method initializeStoreService
   @param {Ember.ApplicationInstance} applicationOrRegistry
   */

  function initializeStoreService(application) {
    var container = application.lookup ? application : application.container;
    // Eagerly generate the store so defaultStore is populated.
    container.lookup('service:store');
  }
});
define("ember-data/-private/serializers", ["exports", "ember-data/serializers/json-api", "ember-data/serializers/json", "ember-data/serializers/rest"], function (exports, _emberDataSerializersJsonApi, _emberDataSerializersJson, _emberDataSerializersRest) {
  exports.JSONAPISerializer = _emberDataSerializersJsonApi.default;
  exports.JSONSerializer = _emberDataSerializersJson.default;
  exports.RESTSerializer = _emberDataSerializersRest.default;
});
/**
  @module ember-data
*/
define("ember-data/-private/system/clone-null", ["exports", "ember-data/-private/system/empty-object"], function (exports, _emberDataPrivateSystemEmptyObject) {
  exports.default = cloneNull;

  function cloneNull(source) {
    var clone = new _emberDataPrivateSystemEmptyObject.default();
    for (var key in source) {
      clone[key] = source[key];
    }
    return clone;
  }
});
define('ember-data/-private/system/coerce-id', ['exports'], function (exports) {
  exports.default = coerceId;
  // Used by the store to normalize IDs entering the store.  Despite the fact
  // that developers may provide IDs as numbers (e.g., `store.findRecord('person', 1)`),
  // it is important that internally we use strings, since IDs may be serialized
  // and lose type information.  For example, Ember's router may put a record's
  // ID into the URL, and if we later try to deserialize that URL and find the
  // corresponding record, we will not know if it is a string or a number.

  function coerceId(id) {
    return id === null || id === undefined || id === '' ? null : id + '';
  }
});
define("ember-data/-private/system/debug", ["exports", "ember-data/-private/system/debug/debug-adapter"], function (exports, _emberDataPrivateSystemDebugDebugAdapter) {
  exports.default = _emberDataPrivateSystemDebugDebugAdapter.default;
});
/**
  @module ember-data
*/
define('ember-data/-private/system/debug/debug-adapter', ['exports', 'ember', 'ember-data/model'], function (exports, _ember, _emberDataModel) {
  var get = _ember.default.get;
  var capitalize = _ember.default.String.capitalize;
  var underscore = _ember.default.String.underscore;
  var assert = _ember.default.assert;

  /*
    Extend `Ember.DataAdapter` with ED specific code.
  
    @class DebugAdapter
    @namespace DS
    @extends Ember.DataAdapter
    @private
  */
  exports.default = _ember.default.DataAdapter.extend({
    getFilters: function () {
      return [{ name: 'isNew', desc: 'New' }, { name: 'isModified', desc: 'Modified' }, { name: 'isClean', desc: 'Clean' }];
    },

    detect: function (typeClass) {
      return typeClass !== _emberDataModel.default && _emberDataModel.default.detect(typeClass);
    },

    columnsForType: function (typeClass) {
      var columns = [{
        name: 'id',
        desc: 'Id'
      }];
      var count = 0;
      var self = this;
      get(typeClass, 'attributes').forEach(function (meta, name) {
        if (count++ > self.attributeLimit) {
          return false;
        }
        var desc = capitalize(underscore(name).replace('_', ' '));
        columns.push({ name: name, desc: desc });
      });
      return columns;
    },

    getRecords: function (modelClass, modelName) {
      if (arguments.length < 2) {
        // Legacy Ember.js < 1.13 support
        var containerKey = modelClass._debugContainerKey;
        if (containerKey) {
          var match = containerKey.match(/model:(.*)/);
          if (match) {
            modelName = match[1];
          }
        }
      }
      assert("Cannot find model name. Please upgrade to Ember.js >= 1.13 for Ember Inspector support", !!modelName);
      return this.get('store').peekAll(modelName);
    },

    getRecordColumnValues: function (record) {
      var _this = this;

      var count = 0;
      var columnValues = { id: get(record, 'id') };

      record.eachAttribute(function (key) {
        if (count++ > _this.attributeLimit) {
          return false;
        }
        var value = get(record, key);
        columnValues[key] = value;
      });
      return columnValues;
    },

    getRecordKeywords: function (record) {
      var keywords = [];
      var keys = _ember.default.A(['id']);
      record.eachAttribute(function (key) {
        return keys.push(key);
      });
      keys.forEach(function (key) {
        return keywords.push(get(record, key));
      });
      return keywords;
    },

    getRecordFilterValues: function (record) {
      return {
        isNew: record.get('isNew'),
        isModified: record.get('hasDirtyAttributes') && !record.get('isNew'),
        isClean: !record.get('hasDirtyAttributes')
      };
    },

    getRecordColor: function (record) {
      var color = 'black';
      if (record.get('isNew')) {
        color = 'green';
      } else if (record.get('hasDirtyAttributes')) {
        color = 'blue';
      }
      return color;
    },

    observeRecord: function (record, recordUpdated) {
      var releaseMethods = _ember.default.A();
      var keysToObserve = _ember.default.A(['id', 'isNew', 'hasDirtyAttributes']);

      record.eachAttribute(function (key) {
        return keysToObserve.push(key);
      });
      var adapter = this;

      keysToObserve.forEach(function (key) {
        var handler = function () {
          recordUpdated(adapter.wrapRecord(record));
        };
        _ember.default.addObserver(record, key, handler);
        releaseMethods.push(function () {
          _ember.default.removeObserver(record, key, handler);
        });
      });

      var release = function () {
        releaseMethods.forEach(function (fn) {
          return fn();
        });
      };

      return release;
    }
  });
});
/**
  @module ember-data
*/
define('ember-data/-private/system/debug/debug-info', ['exports', 'ember'], function (exports, _ember) {
  exports.default = _ember.default.Mixin.create({

    /**
      Provides info about the model for debugging purposes
      by grouping the properties into more semantic groups.
       Meant to be used by debugging tools such as the Chrome Ember Extension.
       - Groups all attributes in "Attributes" group.
      - Groups all belongsTo relationships in "Belongs To" group.
      - Groups all hasMany relationships in "Has Many" group.
      - Groups all flags in "Flags" group.
      - Flags relationship CPs as expensive properties.
       @method _debugInfo
      @for DS.Model
      @private
    */
    _debugInfo: function () {
      var attributes = ['id'];
      var relationships = { belongsTo: [], hasMany: [] };
      var expensiveProperties = [];

      this.eachAttribute(function (name, meta) {
        return attributes.push(name);
      });

      this.eachRelationship(function (name, relationship) {
        relationships[relationship.kind].push(name);
        expensiveProperties.push(name);
      });

      var groups = [{
        name: 'Attributes',
        properties: attributes,
        expand: true
      }, {
        name: 'Belongs To',
        properties: relationships.belongsTo,
        expand: true
      }, {
        name: 'Has Many',
        properties: relationships.hasMany,
        expand: true
      }, {
        name: 'Flags',
        properties: ['isLoaded', 'hasDirtyAttributes', 'isSaving', 'isDeleted', 'isError', 'isNew', 'isValid']
      }];

      return {
        propertyInfo: {
          // include all other mixins / properties (not just the grouped ones)
          includeOtherProperties: true,
          groups: groups,
          // don't pre-calculate unless cached
          expensiveProperties: expensiveProperties
        }
      };
    }
  });
});
define("ember-data/-private/system/empty-object", ["exports"], function (exports) {
  exports.default = EmptyObject;
  // This exists because `Object.create(null)` is absurdly slow compared
  // to `new EmptyObject()`. In either case, you want a null prototype
  // when you're treating the object instances as arbitrary dictionaries
  // and don't want your keys colliding with build-in methods on the
  // default object prototype.
  var proto = Object.create(null, {
    // without this, we will always still end up with (new
    // EmptyObject()).constructor === Object
    constructor: {
      value: undefined,
      enumerable: false,
      writable: true
    }
  });

  function EmptyObject() {}

  EmptyObject.prototype = proto;
});
define('ember-data/-private/system/is-array-like', ['exports', 'ember'], function (exports, _ember) {
  exports.default = isArrayLike;

  /*
    We're using this to detect arrays and "array-like" objects.
  
    This is a copy of the `isArray` method found in `ember-runtime/utils` as we're
    currently unable to import non-exposed modules.
  
    This method was previously exposed as `Ember.isArray` but since
    https://github.com/emberjs/ember.js/pull/11463 `Ember.isArray` is an alias of
    `Array.isArray` hence removing the "array-like" part.
   */

  function isArrayLike(obj) {
    if (!obj || obj.setInterval) {
      return false;
    }
    if (Array.isArray(obj)) {
      return true;
    }
    if (_ember.default.Array.detect(obj)) {
      return true;
    }

    var type = _ember.default.typeOf(obj);
    if ('array' === type) {
      return true;
    }
    if (obj.length !== undefined && 'object' === type) {
      return true;
    }
    return false;
  }
});
define("ember-data/-private/system/many-array", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/promise-proxies", "ember-data/-private/system/store/common"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemPromiseProxies, _emberDataPrivateSystemStoreCommon) {

  var get = _ember.default.get;
  var set = _ember.default.set;

  /**
    A `ManyArray` is a `MutableArray` that represents the contents of a has-many
    relationship.
  
    The `ManyArray` is instantiated lazily the first time the relationship is
    requested.
  
    ### Inverses
  
    Often, the relationships in Ember Data applications will have
    an inverse. For example, imagine the following models are
    defined:
  
    ```app/models/post.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      comments: DS.hasMany('comment')
    });
    ```
  
    ```app/models/comment.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      post: DS.belongsTo('post')
    });
    ```
  
    If you created a new instance of `App.Post` and added
    a `App.Comment` record to its `comments` has-many
    relationship, you would expect the comment's `post`
    property to be set to the post that contained
    the has-many.
  
    We call the record to which a relationship belongs the
    relationship's _owner_.
  
    @class ManyArray
    @namespace DS
    @extends Ember.Object
    @uses Ember.MutableArray, Ember.Evented
  */
  exports.default = _ember.default.Object.extend(_ember.default.MutableArray, _ember.default.Evented, {
    init: function () {
      this._super.apply(this, arguments);
      this.currentState = _ember.default.A([]);
    },

    record: null,

    canonicalState: null,
    currentState: null,

    length: 0,

    objectAt: function (index) {
      //Ember observers such as 'firstObject', 'lastObject' might do out of bounds accesses
      if (!this.currentState[index]) {
        return undefined;
      }
      return this.currentState[index].getRecord();
    },

    flushCanonical: function () {
      //TODO make this smarter, currently its plenty stupid
      var toSet = this.canonicalState.filter(function (internalModel) {
        return !internalModel.isDeleted();
      });

      //a hack for not removing new records
      //TODO remove once we have proper diffing
      var newRecords = this.currentState.filter(
      // only add new records which are not yet in the canonical state of this
      // relationship (a new record can be in the canonical state if it has
      // been 'acknowleged' to be in the relationship via a store.push)
      function (internalModel) {
        return internalModel.isNew() && toSet.indexOf(internalModel) === -1;
      });
      toSet = toSet.concat(newRecords);
      var oldLength = this.length;
      this.arrayContentWillChange(0, this.length, toSet.length);
      // Itâ€™s possible the parent side of the relationship may have been unloaded by this point
      if ((0, _emberDataPrivateSystemStoreCommon._objectIsAlive)(this)) {
        this.set('length', toSet.length);
      }
      this.currentState = toSet;
      this.arrayContentDidChange(0, oldLength, this.length);
      //TODO Figure out to notify only on additions and maybe only if unloaded
      this.relationship.notifyHasManyChanged();
      this.record.updateRecordArrays();
    },
    /**
      `true` if the relationship is polymorphic, `false` otherwise.
       @property {Boolean} isPolymorphic
      @private
    */
    isPolymorphic: false,

    /**
      The loading state of this array
       @property {Boolean} isLoaded
    */
    isLoaded: false,

    /**
      The relationship which manages this array.
       @property {ManyRelationship} relationship
      @private
    */
    relationship: null,

    /**
      Metadata associated with the request for async hasMany relationships.
       Example
       Given that the server returns the following JSON payload when fetching a
      hasMany relationship:
       ```js
      {
        "comments": [{
          "id": 1,
          "comment": "This is the first comment",
        }, {
          // ...
        }],
         "meta": {
          "page": 1,
          "total": 5
        }
      }
      ```
       You can then access the metadata via the `meta` property:
       ```js
      post.get('comments').then(function(comments) {
        var meta = comments.get('meta');
         // meta.page => 1
        // meta.total => 5
      });
      ```
       @property {Object} meta
      @public
    */
    meta: null,

    internalReplace: function (idx, amt, objects) {
      if (!objects) {
        objects = [];
      }
      this.arrayContentWillChange(idx, amt, objects.length);
      this.currentState.splice.apply(this.currentState, [idx, amt].concat(objects));
      this.set('length', this.currentState.length);
      this.arrayContentDidChange(idx, amt, objects.length);
      if (objects) {
        //TODO(Igor) probably needed only for unloaded records
        this.relationship.notifyHasManyChanged();
      }
      this.record.updateRecordArrays();
    },

    //TODO(Igor) optimize
    internalRemoveRecords: function (records) {
      var index;
      for (var i = 0; i < records.length; i++) {
        index = this.currentState.indexOf(records[i]);
        this.internalReplace(index, 1);
      }
    },

    //TODO(Igor) optimize
    internalAddRecords: function (records, idx) {
      if (idx === undefined) {
        idx = this.currentState.length;
      }
      this.internalReplace(idx, 0, records);
    },

    replace: function (idx, amt, objects) {
      var records;
      if (amt > 0) {
        records = this.currentState.slice(idx, idx + amt);
        this.get('relationship').removeRecords(records);
      }
      if (objects) {
        this.get('relationship').addRecords(objects.map(function (obj) {
          return obj._internalModel;
        }), idx);
      }
    },
    /**
      Used for async `hasMany` arrays
      to keep track of when they will resolve.
       @property {Ember.RSVP.Promise} promise
      @private
    */
    promise: null,

    /**
      @method loadingRecordsCount
      @param {Number} count
      @private
    */
    loadingRecordsCount: function (count) {
      this.loadingRecordsCount = count;
    },

    /**
      @method loadedRecord
      @private
    */
    loadedRecord: function () {
      this.loadingRecordsCount--;
      if (this.loadingRecordsCount === 0) {
        set(this, 'isLoaded', true);
        this.trigger('didLoad');
      }
    },

    /**
      @method reload
      @public
    */
    reload: function () {
      return this.relationship.reload();
    },

    /**
      Saves all of the records in the `ManyArray`.
       Example
       ```javascript
      store.findRecord('inbox', 1).then(function(inbox) {
        inbox.get('messages').then(function(messages) {
          messages.forEach(function(message) {
            message.set('isRead', true);
          });
          messages.save()
        });
      });
      ```
       @method save
      @return {DS.PromiseArray} promise
    */
    save: function () {
      var manyArray = this;
      var promiseLabel = "DS: ManyArray#save " + get(this, 'type');
      var promise = _ember.default.RSVP.all(this.invoke("save"), promiseLabel).then(function (array) {
        return manyArray;
      }, null, "DS: ManyArray#save return ManyArray");

      return _emberDataPrivateSystemPromiseProxies.PromiseArray.create({ promise: promise });
    },

    /**
      Create a child record within the owner
       @method createRecord
      @private
      @param {Object} hash
      @return {DS.Model} record
    */
    createRecord: function (hash) {
      var store = get(this, 'store');
      var type = get(this, 'type');
      var record;

      record = store.createRecord(type.modelName, hash);
      this.pushObject(record);

      return record;
    }
  });
});
/**
  @module ember-data
*/
define("ember-data/-private/system/model", ["exports", "ember-data/-private/system/model/model", "ember-data/attr", "ember-data/-private/system/model/states", "ember-data/-private/system/model/errors"], function (exports, _emberDataPrivateSystemModelModel, _emberDataAttr, _emberDataPrivateSystemModelStates, _emberDataPrivateSystemModelErrors) {
  exports.RootState = _emberDataPrivateSystemModelStates.default;
  exports.attr = _emberDataAttr.default;
  exports.Errors = _emberDataPrivateSystemModelErrors.default;
  exports.default = _emberDataPrivateSystemModelModel.default;
});
/**
  @module ember-data
*/
define("ember-data/-private/system/model/attr", ["exports", "ember", "ember-data/-private/debug"], function (exports, _ember, _emberDataPrivateDebug) {

  var get = _ember.default.get;
  var Map = _ember.default.Map;

  /**
    @module ember-data
  */

  /**
    @class Model
    @namespace DS
  */

  var AttrClassMethodsMixin = _ember.default.Mixin.create({
    /**
      A map whose keys are the attributes of the model (properties
      described by DS.attr) and whose values are the meta object for the
      property.
       Example
       ```app/models/person.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        firstName: attr('string'),
        lastName: attr('string'),
        birthday: attr('date')
      });
      ```
       ```javascript
      import Ember from 'ember';
      import Person from 'app/models/person';
       var attributes = Ember.get(Person, 'attributes')
       attributes.forEach(function(meta, name) {
        console.log(name, meta);
      });
       // prints:
      // firstName {type: "string", isAttribute: true, options: Object, parentType: function, name: "firstName"}
      // lastName {type: "string", isAttribute: true, options: Object, parentType: function, name: "lastName"}
      // birthday {type: "date", isAttribute: true, options: Object, parentType: function, name: "birthday"}
      ```
       @property attributes
      @static
      @type {Ember.Map}
      @readOnly
    */
    attributes: _ember.default.computed(function () {
      var map = Map.create();

      this.eachComputedProperty(function (name, meta) {
        if (meta.isAttribute) {

          meta.name = name;
          map.set(name, meta);
        }
      });

      return map;
    }).readOnly(),

    /**
      A map whose keys are the attributes of the model (properties
      described by DS.attr) and whose values are type of transformation
      applied to each attribute. This map does not include any
      attributes that do not have an transformation type.
       Example
       ```app/models/person.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        firstName: attr(),
        lastName: attr('string'),
        birthday: attr('date')
      });
      ```
       ```javascript
      import Ember from 'ember';
      import Person from 'app/models/person';
       var transformedAttributes = Ember.get(Person, 'transformedAttributes')
       transformedAttributes.forEach(function(field, type) {
        console.log(field, type);
      });
       // prints:
      // lastName string
      // birthday date
      ```
       @property transformedAttributes
      @static
      @type {Ember.Map}
      @readOnly
    */
    transformedAttributes: _ember.default.computed(function () {
      var map = Map.create();

      this.eachAttribute(function (key, meta) {
        if (meta.type) {
          map.set(key, meta.type);
        }
      });

      return map;
    }).readOnly(),

    /**
      Iterates through the attributes of the model, calling the passed function on each
      attribute.
       The callback method you provide should have the following signature (all
      parameters are optional):
       ```javascript
      function(name, meta);
      ```
       - `name` the name of the current property in the iteration
      - `meta` the meta object for the attribute property in the iteration
       Note that in addition to a callback, you can also pass an optional target
      object that will be set as `this` on the context.
       Example
       ```javascript
      import DS from 'ember-data';
       var Person = DS.Model.extend({
        firstName: attr('string'),
        lastName: attr('string'),
        birthday: attr('date')
      });
       Person.eachAttribute(function(name, meta) {
        console.log(name, meta);
      });
       // prints:
      // firstName {type: "string", isAttribute: true, options: Object, parentType: function, name: "firstName"}
      // lastName {type: "string", isAttribute: true, options: Object, parentType: function, name: "lastName"}
      // birthday {type: "date", isAttribute: true, options: Object, parentType: function, name: "birthday"}
     ```
       @method eachAttribute
      @param {Function} callback The callback to execute
      @param {Object} [binding] the value to which the callback's `this` should be bound
      @static
    */
    eachAttribute: function (callback, binding) {
      get(this, 'attributes').forEach(function (meta, name) {
        callback.call(binding, name, meta);
      });
    },

    /**
      Iterates through the transformedAttributes of the model, calling
      the passed function on each attribute. Note the callback will not be
      called for any attributes that do not have an transformation type.
       The callback method you provide should have the following signature (all
      parameters are optional):
       ```javascript
      function(name, type);
      ```
       - `name` the name of the current property in the iteration
      - `type` a string containing the name of the type of transformed
        applied to the attribute
       Note that in addition to a callback, you can also pass an optional target
      object that will be set as `this` on the context.
       Example
       ```javascript
      import DS from 'ember-data';
       var Person = DS.Model.extend({
        firstName: attr(),
        lastName: attr('string'),
        birthday: attr('date')
      });
       Person.eachTransformedAttribute(function(name, type) {
        console.log(name, type);
      });
       // prints:
      // lastName string
      // birthday date
     ```
       @method eachTransformedAttribute
      @param {Function} callback The callback to execute
      @param {Object} [binding] the value to which the callback's `this` should be bound
      @static
    */
    eachTransformedAttribute: function (callback, binding) {
      get(this, 'transformedAttributes').forEach(function (type, name) {
        callback.call(binding, name, type);
      });
    }
  });

  exports.AttrClassMethodsMixin = AttrClassMethodsMixin;
  var AttrInstanceMethodsMixin = _ember.default.Mixin.create({
    eachAttribute: function (callback, binding) {
      this.constructor.eachAttribute(callback, binding);
    }
  });
  exports.AttrInstanceMethodsMixin = AttrInstanceMethodsMixin;
});
define('ember-data/-private/system/model/errors', ['exports', 'ember', 'ember-data/-private/debug'], function (exports, _ember, _emberDataPrivateDebug) {

  var get = _ember.default.get;
  var set = _ember.default.set;
  var isEmpty = _ember.default.isEmpty;
  var makeArray = _ember.default.makeArray;

  var MapWithDefault = _ember.default.MapWithDefault;

  /**
  @module ember-data
  */

  /**
    Holds validation errors for a given record, organized by attribute names.
  
    Every `DS.Model` has an `errors` property that is an instance of
    `DS.Errors`. This can be used to display validation error
    messages returned from the server when a `record.save()` rejects.
  
    For Example, if you had a `User` model that looked like this:
  
    ```app/models/user.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      username: attr('string'),
      email: attr('string')
    });
    ```
    And you attempted to save a record that did not validate on the backend:
  
    ```javascript
    var user = store.createRecord('user', {
      username: 'tomster',
      email: 'invalidEmail'
    });
    user.save();
    ```
  
    Your backend would be expected to return an error response that described
    the problem, so that error messages can be generated on the app.
  
    API responses will be translated into instances of `DS.Errors` differently,
    depending on the specific combination of adapter and serializer used. You
    may want to check the documentation or the source code of the libraries
    that you are using, to know how they expect errors to be communicated.
  
    Errors can be displayed to the user by accessing their property name
    to get an array of all the error objects for that property. Each
    error object is a JavaScript object with two keys:
  
    - `message` A string containing the error message from the backend
    - `attribute` The name of the property associated with this error message
  
    ```handlebars
    <label>Username: {{input value=username}} </label>
    {{#each model.errors.username as |error|}}
      <div class="error">
        {{error.message}}
      </div>
    {{/each}}
  
    <label>Email: {{input value=email}} </label>
    {{#each model.errors.email as |error|}}
      <div class="error">
        {{error.message}}
      </div>
    {{/each}}
    ```
  
    You can also access the special `messages` property on the error
    object to get an array of all the error strings.
  
    ```handlebars
    {{#each model.errors.messages as |message|}}
      <div class="error">
        {{message}}
      </div>
    {{/each}}
    ```
  
    @class Errors
    @namespace DS
    @extends Ember.Object
    @uses Ember.Enumerable
    @uses Ember.Evented
   */
  exports.default = _ember.default.ArrayProxy.extend(_ember.default.Evented, {
    /**
      Register with target handler
       @method registerHandlers
      @param {Object} target
      @param {Function} becameInvalid
      @param {Function} becameValid
      @deprecated
    */
    registerHandlers: function (target, becameInvalid, becameValid) {

      this._registerHandlers(target, becameInvalid, becameValid);
    },

    /**
      Register with target handler
       @method _registerHandlers
      @private
    */
    _registerHandlers: function (target, becameInvalid, becameValid) {
      this.on('becameInvalid', target, becameInvalid);
      this.on('becameValid', target, becameValid);
    },

    /**
      @property errorsByAttributeName
      @type {Ember.MapWithDefault}
      @private
    */
    errorsByAttributeName: _ember.default.computed(function () {
      return MapWithDefault.create({
        defaultValue: function () {
          return _ember.default.A();
        }
      });
    }),

    /**
      Returns errors for a given attribute
       ```javascript
      var user = store.createRecord('user', {
        username: 'tomster',
        email: 'invalidEmail'
      });
      user.save().catch(function(){
        user.get('errors').errorsFor('email'); // returns:
        // [{attribute: "email", message: "Doesn't look like a valid email."}]
      });
      ```
       @method errorsFor
      @param {String} attribute
      @return {Array}
    */
    errorsFor: function (attribute) {
      return get(this, 'errorsByAttributeName').get(attribute);
    },

    /**
      An array containing all of the error messages for this
      record. This is useful for displaying all errors to the user.
       ```handlebars
      {{#each model.errors.messages as |message|}}
        <div class="error">
          {{message}}
        </div>
      {{/each}}
      ```
       @property messages
      @type {Array}
    */
    messages: _ember.default.computed.mapBy('content', 'message'),

    /**
      @property content
      @type {Array}
      @private
    */
    content: _ember.default.computed(function () {
      return _ember.default.A();
    }),

    /**
      @method unknownProperty
      @private
    */
    unknownProperty: function (attribute) {
      var errors = this.errorsFor(attribute);
      if (isEmpty(errors)) {
        return null;
      }
      return errors;
    },

    /**
      Total number of errors.
       @property length
      @type {Number}
      @readOnly
    */

    /**
      @property isEmpty
      @type {Boolean}
      @readOnly
    */
    isEmpty: _ember.default.computed.not('length').readOnly(),

    /**
      Adds error messages to a given attribute and sends
      `becameInvalid` event to the record.
       Example:
       ```javascript
      if (!user.get('username') {
        user.get('errors').add('username', 'This field is required');
      }
      ```
       @method add
      @param {String} attribute
      @param {(Array|String)} messages
      @deprecated
    */
    add: function (attribute, messages) {

      var wasEmpty = get(this, 'isEmpty');

      this._add(attribute, messages);

      if (wasEmpty && !get(this, 'isEmpty')) {
        this.trigger('becameInvalid');
      }
    },

    /**
      Adds error messages to a given attribute without sending event.
       @method _add
      @private
    */
    _add: function (attribute, messages) {
      messages = this._findOrCreateMessages(attribute, messages);
      this.addObjects(messages);
      get(this, 'errorsByAttributeName').get(attribute).addObjects(messages);

      this.notifyPropertyChange(attribute);
    },

    /**
      @method _findOrCreateMessages
      @private
    */
    _findOrCreateMessages: function (attribute, messages) {
      var errors = this.errorsFor(attribute);
      var messagesArray = makeArray(messages);
      var _messages = new Array(messagesArray.length);

      for (var i = 0; i < messagesArray.length; i++) {
        var message = messagesArray[i];
        var err = errors.findBy('message', message);
        if (err) {
          _messages[i] = err;
        } else {
          _messages[i] = {
            attribute: attribute,
            message: message
          };
        }
      }

      return _messages;
    },

    /**
      Removes all error messages from the given attribute and sends
      `becameValid` event to the record if there no more errors left.
       Example:
       ```app/models/user.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        email: DS.attr('string'),
        twoFactorAuth: DS.attr('boolean'),
        phone: DS.attr('string')
      });
      ```
       ```app/routes/user/edit.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        actions: {
          save: function(user) {
             if (!user.get('twoFactorAuth')) {
               user.get('errors').remove('phone');
             }
             user.save();
           }
        }
      });
      ```
       @method remove
      @param {String} attribute
      @deprecated
    */
    remove: function (attribute) {

      if (get(this, 'isEmpty')) {
        return;
      }

      this._remove(attribute);

      if (get(this, 'isEmpty')) {
        this.trigger('becameValid');
      }
    },

    /**
      Removes all error messages from the given attribute without sending event.
       @method _remove
      @private
    */
    _remove: function (attribute) {
      if (get(this, 'isEmpty')) {
        return;
      }

      var content = this.rejectBy('attribute', attribute);
      set(this, 'content', content);
      get(this, 'errorsByAttributeName').delete(attribute);

      this.notifyPropertyChange(attribute);
    },

    /**
      Removes all error messages and sends `becameValid` event
      to the record.
       Example:
       ```app/routes/user/edit.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        actions: {
          retrySave: function(user) {
             user.get('errors').clear();
             user.save();
           }
        }
      });
      ```
       @method clear
      @deprecated
    */
    clear: function () {

      if (get(this, 'isEmpty')) {
        return;
      }

      this._clear();
      this.trigger('becameValid');
    },

    /**
      Removes all error messages.
      to the record.
       @method _clear
      @private
    */
    _clear: function () {
      if (get(this, 'isEmpty')) {
        return;
      }

      var errorsByAttributeName = get(this, 'errorsByAttributeName');
      var attributes = _ember.default.A();

      errorsByAttributeName.forEach(function (_, attribute) {
        attributes.push(attribute);
      });

      errorsByAttributeName.clear();
      attributes.forEach(function (attribute) {
        this.notifyPropertyChange(attribute);
      }, this);

      _ember.default.ArrayProxy.prototype.clear.call(this);
    },

    /**
      Checks if there is error messages for the given attribute.
       ```app/routes/user/edit.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        actions: {
          save: function(user) {
             if (user.get('errors').has('email')) {
               return alert('Please update your email before attempting to save.');
             }
             user.save();
           }
        }
      });
      ```
       @method has
      @param {String} attribute
      @return {Boolean} true if there some errors on given attribute
    */
    has: function (attribute) {
      return !isEmpty(this.errorsFor(attribute));
    }
  });
});
define("ember-data/-private/system/model/internal-model", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/model/states", "ember-data/-private/system/relationships/state/create", "ember-data/-private/system/snapshot", "ember-data/-private/system/empty-object", "ember-data/-private/features", "ember-data/-private/utils", "ember-data/-private/system/references"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemModelStates, _emberDataPrivateSystemRelationshipsStateCreate, _emberDataPrivateSystemSnapshot, _emberDataPrivateSystemEmptyObject, _emberDataPrivateFeatures, _emberDataPrivateUtils, _emberDataPrivateSystemReferences) {
  exports.default = InternalModel;

  var Promise = _ember.default.RSVP.Promise;
  var get = _ember.default.get;
  var set = _ember.default.set;
  var copy = _ember.default.copy;
  var assign = _ember.default.assign || _ember.default.merge;

  var _extractPivotNameCache = new _emberDataPrivateSystemEmptyObject.default();
  var _splitOnDotCache = new _emberDataPrivateSystemEmptyObject.default();

  function splitOnDot(name) {
    return _splitOnDotCache[name] || (_splitOnDotCache[name] = name.split('.'));
  }

  function extractPivotName(name) {
    return _extractPivotNameCache[name] || (_extractPivotNameCache[name] = splitOnDot(name)[0]);
  }

  function retrieveFromCurrentState(key) {
    return function () {
      return get(this.currentState, key);
    };
  }

  // this (and all heimdall instrumentation) will be stripped by a babel transform
  //  https://github.com/heimdalljs/babel5-plugin-strip-heimdall

  /*
    `InternalModel` is the Model class that we use internally inside Ember Data to represent models.
    Internal ED methods should only deal with `InternalModel` objects. It is a fast, plain Javascript class.
  
    We expose `DS.Model` to application code, by materializing a `DS.Model` from `InternalModel` lazily, as
    a performance optimization.
  
    `InternalModel` should never be exposed to application code. At the boundaries of the system, in places
    like `find`, `push`, etc. we convert between Models and InternalModels.
  
    We need to make sure that the properties from `InternalModel` are correctly exposed/proxied on `Model`
    if they are needed.
  
    @private
    @class InternalModel
  */

  function InternalModel(type, id, store, _, data) {
    this.type = type;
    this.id = id;
    this.store = store;
    this._data = data || new _emberDataPrivateSystemEmptyObject.default();
    this.modelName = type.modelName;
    this.dataHasInitialized = false;
    //Look into making this lazy
    this._deferredTriggers = [];
    this._attributes = new _emberDataPrivateSystemEmptyObject.default();
    this._inFlightAttributes = new _emberDataPrivateSystemEmptyObject.default();
    this._relationships = new _emberDataPrivateSystemRelationshipsStateCreate.default(this);
    this._recordArrays = undefined;
    this.currentState = _emberDataPrivateSystemModelStates.default.empty;
    this.recordReference = new _emberDataPrivateSystemReferences.RecordReference(store, this);
    this.references = {};
    this.isReloading = false;
    this.isError = false;
    this.error = null;
    this.__ember_meta__ = null;
    this[_ember.default.GUID_KEY] = _ember.default.guidFor(this);
    /*
      implicit relationships are relationship which have not been declared but the inverse side exists on
      another record somewhere
      For example if there was
       ```app/models/comment.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        name: DS.attr()
      })
      ```
       but there is also
       ```app/models/post.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        name: DS.attr(),
        comments: DS.hasMany('comment')
      })
      ```
       would have a implicit post relationship in order to be do things like remove ourselves from the post
      when we are deleted
    */
    this._implicitRelationships = new _emberDataPrivateSystemEmptyObject.default();
  }

  InternalModel.prototype = {
    isEmpty: retrieveFromCurrentState('isEmpty'),
    isLoading: retrieveFromCurrentState('isLoading'),
    isLoaded: retrieveFromCurrentState('isLoaded'),
    hasDirtyAttributes: retrieveFromCurrentState('hasDirtyAttributes'),
    isSaving: retrieveFromCurrentState('isSaving'),
    isDeleted: retrieveFromCurrentState('isDeleted'),
    isNew: retrieveFromCurrentState('isNew'),
    isValid: retrieveFromCurrentState('isValid'),
    dirtyType: retrieveFromCurrentState('dirtyType'),

    constructor: InternalModel,
    materializeRecord: function () {

      // lookupFactory should really return an object that creates
      // instances with the injections applied
      var createOptions = {
        store: this.store,
        _internalModel: this,
        id: this.id,
        currentState: get(this, 'currentState'),
        isError: this.isError,
        adapterError: this.error
      };

      if (_ember.default.setOwner) {
        // ensure that `Ember.getOwner(this)` works inside a model instance
        _ember.default.setOwner(createOptions, (0, _emberDataPrivateUtils.getOwner)(this.store));
      } else {
        createOptions.container = this.store.container;
      }

      this.record = this.type._create(createOptions);

      this._triggerDeferredTriggers();
    },

    recordObjectWillDestroy: function () {
      this.record = null;
    },

    deleteRecord: function () {
      this.send('deleteRecord');
    },

    save: function (options) {
      var promiseLabel = "DS: Model#save " + this;
      var resolver = _ember.default.RSVP.defer(promiseLabel);

      this.store.scheduleSave(this, resolver, options);
      return resolver.promise;
    },

    startedReloading: function () {
      this.isReloading = true;
      if (this.record) {
        set(this.record, 'isReloading', true);
      }
    },

    finishedReloading: function () {
      this.isReloading = false;
      if (this.record) {
        set(this.record, 'isReloading', false);
      }
    },

    reload: function () {
      this.startedReloading();
      var record = this;
      var promiseLabel = "DS: Model#reload of " + this;
      return new Promise(function (resolve) {
        record.send('reloadRecord', resolve);
      }, promiseLabel).then(function () {
        record.didCleanError();
        return record;
      }, function (error) {
        record.didError(error);
        throw error;
      }, "DS: Model#reload complete, update flags").finally(function () {
        record.finishedReloading();
        record.updateRecordArrays();
      });
    },

    getRecord: function () {
      if (!this.record) {
        this.materializeRecord();
      }
      return this.record;
    },

    unloadRecord: function () {
      this.send('unloadRecord');
    },

    eachRelationship: function (callback, binding) {
      return this.type.eachRelationship(callback, binding);
    },

    eachAttribute: function (callback, binding) {
      return this.type.eachAttribute(callback, binding);
    },

    inverseFor: function (key) {
      return this.type.inverseFor(key);
    },

    setupData: function (data) {
      var changedKeys = this._changedKeys(data.attributes);
      assign(this._data, data.attributes);
      this.pushedData();
      if (this.record) {
        this.record._notifyProperties(changedKeys);
      }
      this.didInitializeData();
    },

    becameReady: function () {
      _ember.default.run.schedule('actions', this.store.recordArrayManager, this.store.recordArrayManager.recordWasLoaded, this);
    },

    didInitializeData: function () {
      if (!this.dataHasInitialized) {
        this.becameReady();
        this.dataHasInitialized = true;
      }
    },

    destroy: function () {
      if (this.record) {
        return this.record.destroy();
      }
    },

    /*
      @method createSnapshot
      @private
    */
    createSnapshot: function (options) {
      return new _emberDataPrivateSystemSnapshot.default(this, options);
    },

    /*
      @method loadingData
      @private
      @param {Promise} promise
    */
    loadingData: function (promise) {
      this.send('loadingData', promise);
    },

    /*
      @method loadedData
      @private
    */
    loadedData: function () {
      this.send('loadedData');
      this.didInitializeData();
    },

    /*
      @method notFound
      @private
    */
    notFound: function () {
      this.send('notFound');
    },

    /*
      @method pushedData
      @private
    */
    pushedData: function () {
      this.send('pushedData');
    },

    flushChangedAttributes: function () {
      this._inFlightAttributes = this._attributes;
      this._attributes = new _emberDataPrivateSystemEmptyObject.default();
    },

    hasChangedAttributes: function () {
      return Object.keys(this._attributes).length > 0;
    },

    /*
      Checks if the attributes which are considered as changed are still
      different to the state which is acknowledged by the server.
       This method is needed when data for the internal model is pushed and the
      pushed data might acknowledge dirty attributes as confirmed.
       @method updateChangedAttributes
      @private
     */
    updateChangedAttributes: function () {
      var changedAttributes = this.changedAttributes();
      var changedAttributeNames = Object.keys(changedAttributes);

      for (var i = 0, _length = changedAttributeNames.length; i < _length; i++) {
        var attribute = changedAttributeNames[i];
        var data = changedAttributes[attribute];
        var oldData = data[0];
        var newData = data[1];

        if (oldData === newData) {
          delete this._attributes[attribute];
        }
      }
    },

    /*
      Returns an object, whose keys are changed properties, and value is an
      [oldProp, newProp] array.
       @method changedAttributes
      @private
    */
    changedAttributes: function () {
      var oldData = this._data;
      var currentData = this._attributes;
      var inFlightData = this._inFlightAttributes;
      var newData = assign(copy(inFlightData), currentData);
      var diffData = new _emberDataPrivateSystemEmptyObject.default();

      var newDataKeys = Object.keys(newData);

      for (var i = 0, _length2 = newDataKeys.length; i < _length2; i++) {
        var key = newDataKeys[i];
        diffData[key] = [oldData[key], newData[key]];
      }

      return diffData;
    },

    /*
      @method adapterWillCommit
      @private
    */
    adapterWillCommit: function () {
      this.send('willCommit');
    },

    /*
      @method adapterDidDirty
      @private
    */
    adapterDidDirty: function () {
      this.send('becomeDirty');
      this.updateRecordArraysLater();
    },

    /*
      @method send
      @private
      @param {String} name
      @param {Object} context
    */
    send: function (name, context) {
      var currentState = get(this, 'currentState');

      if (!currentState[name]) {
        this._unhandledEvent(currentState, name, context);
      }

      return currentState[name](this, context);
    },

    notifyHasManyAdded: function (key, record, idx) {
      if (this.record) {
        this.record.notifyHasManyAdded(key, record, idx);
      }
    },

    notifyHasManyRemoved: function (key, record, idx) {
      if (this.record) {
        this.record.notifyHasManyRemoved(key, record, idx);
      }
    },

    notifyBelongsToChanged: function (key, record) {
      if (this.record) {
        this.record.notifyBelongsToChanged(key, record);
      }
    },

    notifyPropertyChange: function (key) {
      if (this.record) {
        this.record.notifyPropertyChange(key);
      }
    },

    rollbackAttributes: function () {
      var dirtyKeys = Object.keys(this._attributes);

      this._attributes = new _emberDataPrivateSystemEmptyObject.default();

      if (get(this, 'isError')) {
        this._inFlightAttributes = new _emberDataPrivateSystemEmptyObject.default();
        this.didCleanError();
      }

      //Eventually rollback will always work for relationships
      //For now we support it only out of deleted state, because we
      //have an explicit way of knowing when the server acked the relationship change
      if (this.isDeleted()) {
        //TODO: Should probably move this to the state machine somehow
        this.becameReady();
      }

      if (this.isNew()) {
        this.clearRelationships();
      }

      if (this.isValid()) {
        this._inFlightAttributes = new _emberDataPrivateSystemEmptyObject.default();
      }

      this.send('rolledBack');

      this.record._notifyProperties(dirtyKeys);
    },

    /*
      @method transitionTo
      @private
      @param {String} name
    */
    transitionTo: function (name) {
      // POSSIBLE TODO: Remove this code and replace with
      // always having direct reference to state objects

      var pivotName = extractPivotName(name);
      var currentState = get(this, 'currentState');
      var state = currentState;

      do {
        if (state.exit) {
          state.exit(this);
        }
        state = state.parentState;
      } while (!state.hasOwnProperty(pivotName));

      var path = splitOnDot(name);
      var setups = [];
      var enters = [];
      var i, l;

      for (i = 0, l = path.length; i < l; i++) {
        state = state[path[i]];

        if (state.enter) {
          enters.push(state);
        }
        if (state.setup) {
          setups.push(state);
        }
      }

      for (i = 0, l = enters.length; i < l; i++) {
        enters[i].enter(this);
      }

      set(this, 'currentState', state);
      //TODO Consider whether this is the best approach for keeping these two in sync
      if (this.record) {
        set(this.record, 'currentState', state);
      }

      for (i = 0, l = setups.length; i < l; i++) {
        setups[i].setup(this);
      }

      this.updateRecordArraysLater();
    },

    _unhandledEvent: function (state, name, context) {
      var errorMessage = "Attempted to handle event `" + name + "` ";
      errorMessage += "on " + String(this) + " while in state ";
      errorMessage += state.stateName + ". ";

      if (context !== undefined) {
        errorMessage += "Called with " + _ember.default.inspect(context) + ".";
      }

      throw new _ember.default.Error(errorMessage);
    },

    triggerLater: function () {
      var length = arguments.length;
      var args = new Array(length);

      for (var i = 0; i < length; i++) {
        args[i] = arguments[i];
      }

      if (this._deferredTriggers.push(args) !== 1) {
        return;
      }
      _ember.default.run.scheduleOnce('actions', this, '_triggerDeferredTriggers');
    },

    _triggerDeferredTriggers: function () {
      //TODO: Before 1.0 we want to remove all the events that happen on the pre materialized record,
      //but for now, we queue up all the events triggered before the record was materialized, and flush
      //them once we have the record
      if (!this.record) {
        return;
      }
      for (var i = 0, l = this._deferredTriggers.length; i < l; i++) {
        this.record.trigger.apply(this.record, this._deferredTriggers[i]);
      }

      this._deferredTriggers.length = 0;
    },
    /*
      @method clearRelationships
      @private
    */
    clearRelationships: function () {
      var _this = this;

      this.eachRelationship(function (name, relationship) {
        if (_this._relationships.has(name)) {
          var rel = _this._relationships.get(name);
          rel.clear();
          rel.destroy();
        }
      });
      Object.keys(this._implicitRelationships).forEach(function (key) {
        _this._implicitRelationships[key].clear();
        _this._implicitRelationships[key].destroy();
      });
    },

    /*
      When a find request is triggered on the store, the user can optionally pass in
      attributes and relationships to be preloaded. These are meant to behave as if they
      came back from the server, except the user obtained them out of band and is informing
      the store of their existence. The most common use case is for supporting client side
      nested URLs, such as `/posts/1/comments/2` so the user can do
      `store.findRecord('comment', 2, { preload: { post: 1 } })` without having to fetch the post.
       Preloaded data can be attributes and relationships passed in either as IDs or as actual
      models.
       @method _preloadData
      @private
      @param {Object} preload
    */
    _preloadData: function (preload) {
      var _this2 = this;

      //TODO(Igor) consider the polymorphic case
      Object.keys(preload).forEach(function (key) {
        var preloadValue = get(preload, key);
        var relationshipMeta = _this2.type.metaForProperty(key);
        if (relationshipMeta.isRelationship) {
          _this2._preloadRelationship(key, preloadValue);
        } else {
          _this2._data[key] = preloadValue;
        }
      });
    },

    _preloadRelationship: function (key, preloadValue) {
      var relationshipMeta = this.type.metaForProperty(key);
      var type = relationshipMeta.type;
      if (relationshipMeta.kind === 'hasMany') {
        this._preloadHasMany(key, preloadValue, type);
      } else {
        this._preloadBelongsTo(key, preloadValue, type);
      }
    },

    _preloadHasMany: function (key, preloadValue, type) {
      var recordsToSet = new Array(preloadValue.length);

      for (var i = 0; i < preloadValue.length; i++) {
        var recordToPush = preloadValue[i];
        recordsToSet[i] = this._convertStringOrNumberIntoInternalModel(recordToPush, type);
      }

      //We use the pathway of setting the hasMany as if it came from the adapter
      //because the user told us that they know this relationships exists already
      this._relationships.get(key).updateRecordsFromAdapter(recordsToSet);
    },

    _preloadBelongsTo: function (key, preloadValue, type) {
      var recordToSet = this._convertStringOrNumberIntoInternalModel(preloadValue, type);

      //We use the pathway of setting the hasMany as if it came from the adapter
      //because the user told us that they know this relationships exists already
      this._relationships.get(key).setRecord(recordToSet);
    },

    _convertStringOrNumberIntoInternalModel: function (value, type) {
      if (typeof value === 'string' || typeof value === 'number') {
        return this.store._internalModelForId(type, value);
      }
      if (value._internalModel) {
        return value._internalModel;
      }
      return value;
    },

    /*
      @method updateRecordArrays
      @private
    */
    updateRecordArrays: function () {
      this._updatingRecordArraysLater = false;
      this.store.dataWasUpdated(this.type, this);
    },

    setId: function (id) {
      this.id = id;
      if (this.record.get('id') !== id) {
        this.record.set('id', id);
      }
    },

    didError: function (error) {
      this.error = error;
      this.isError = true;

      if (this.record) {
        this.record.setProperties({
          isError: true,
          adapterError: error
        });
      }
    },

    didCleanError: function () {
      this.error = null;
      this.isError = false;

      if (this.record) {
        this.record.setProperties({
          isError: false,
          adapterError: null
        });
      }
    },
    /*
      If the adapter did not return a hash in response to a commit,
      merge the changed attributes and relationships into the existing
      saved data.
       @method adapterDidCommit
    */
    adapterDidCommit: function (data) {
      if (data) {
        data = data.attributes;
      }

      this.didCleanError();
      var changedKeys = this._changedKeys(data);

      assign(this._data, this._inFlightAttributes);
      if (data) {
        assign(this._data, data);
      }

      this._inFlightAttributes = new _emberDataPrivateSystemEmptyObject.default();

      this.send('didCommit');
      this.updateRecordArraysLater();

      if (!data) {
        return;
      }

      this.record._notifyProperties(changedKeys);
    },

    /*
      @method updateRecordArraysLater
      @private
    */
    updateRecordArraysLater: function () {
      // quick hack (something like this could be pushed into run.once
      if (this._updatingRecordArraysLater) {
        return;
      }
      this._updatingRecordArraysLater = true;
      _ember.default.run.schedule('actions', this, this.updateRecordArrays);
    },

    addErrorMessageToAttribute: function (attribute, message) {
      var record = this.getRecord();
      get(record, 'errors')._add(attribute, message);
    },

    removeErrorMessageFromAttribute: function (attribute) {
      var record = this.getRecord();
      get(record, 'errors')._remove(attribute);
    },

    clearErrorMessages: function () {
      var record = this.getRecord();
      get(record, 'errors')._clear();
    },

    hasErrors: function () {
      var record = this.getRecord();
      var errors = get(record, 'errors');

      return !_ember.default.isEmpty(errors);
    },

    // FOR USE DURING COMMIT PROCESS

    /*
      @method adapterDidInvalidate
      @private
    */
    adapterDidInvalidate: function (errors) {
      var attribute;

      for (attribute in errors) {
        if (errors.hasOwnProperty(attribute)) {
          this.addErrorMessageToAttribute(attribute, errors[attribute]);
        }
      }

      this.send('becameInvalid');

      this._saveWasRejected();
    },

    /*
      @method adapterDidError
      @private
    */
    adapterDidError: function (error) {
      this.send('becameError');
      this.didError(error);
      this._saveWasRejected();
    },

    _saveWasRejected: function () {
      var keys = Object.keys(this._inFlightAttributes);
      for (var i = 0; i < keys.length; i++) {
        if (this._attributes[keys[i]] === undefined) {
          this._attributes[keys[i]] = this._inFlightAttributes[keys[i]];
        }
      }
      this._inFlightAttributes = new _emberDataPrivateSystemEmptyObject.default();
    },

    /*
      Ember Data has 3 buckets for storing the value of an attribute on an internalModel.
       `_data` holds all of the attributes that have been acknowledged by
      a backend via the adapter. When rollbackAttributes is called on a model all
      attributes will revert to the record's state in `_data`.
       `_attributes` holds any change the user has made to an attribute
      that has not been acknowledged by the adapter. Any values in
      `_attributes` are have priority over values in `_data`.
       `_inFlightAttributes`. When a record is being synced with the
      backend the values in `_attributes` are copied to
      `_inFlightAttributes`. This way if the backend acknowledges the
      save but does not return the new state Ember Data can copy the
      values from `_inFlightAttributes` to `_data`. Without having to
      worry about changes made to `_attributes` while the save was
      happenign.
        Changed keys builds a list of all of the values that may have been
      changed by the backend after a successful save.
       It does this by iterating over each key, value pair in the payload
      returned from the server after a save. If the `key` is found in
      `_attributes` then the user has a local changed to the attribute
      that has not been synced with the server and the key is not
      included in the list of changed keys.
    
      If the value, for a key differs from the value in what Ember Data
      believes to be the truth about the backend state (A merger of the
      `_data` and `_inFlightAttributes` objects where
      `_inFlightAttributes` has priority) then that means the backend
      has updated the value and the key is added to the list of changed
      keys.
       @method _changedKeys
      @private
    */
    _changedKeys: function (updates) {
      var changedKeys = [];

      if (updates) {
        var original, i, value, key;
        var keys = Object.keys(updates);
        var length = keys.length;

        original = assign(new _emberDataPrivateSystemEmptyObject.default(), this._data);
        original = assign(original, this._inFlightAttributes);

        for (i = 0; i < length; i++) {
          key = keys[i];
          value = updates[key];

          // A value in _attributes means the user has a local change to
          // this attributes. We never override this value when merging
          // updates from the backend so we should not sent a change
          // notification if the server value differs from the original.
          if (this._attributes[key] !== undefined) {
            continue;
          }

          if (!_ember.default.isEqual(original[key], value)) {
            changedKeys.push(key);
          }
        }
      }

      return changedKeys;
    },

    toString: function () {
      if (this.record) {
        return this.record.toString();
      } else {
        return "<" + this.modelName + ":" + this.id + ">";
      }
    },

    referenceFor: function (type, name) {
      var reference = this.references[name];

      if (!reference) {
        var relationship = this._relationships.get(name);

        if (type === "belongsTo") {
          reference = new _emberDataPrivateSystemReferences.BelongsToReference(this.store, this, relationship);
        } else if (type === "hasMany") {
          reference = new _emberDataPrivateSystemReferences.HasManyReference(this.store, this, relationship);
        }

        this.references[name] = reference;
      }

      return reference;
    }
  };

  if (false) {
    /*
       Returns the latest truth for an attribute - the canonical value, or the
       in-flight value.
        @method lastAcknowledgedValue
       @private
    */
    InternalModel.prototype.lastAcknowledgedValue = function lastAcknowledgedValue(key) {
      if (key in this._inFlightAttributes) {
        return this._inFlightAttributes[key];
      } else {
        return this._data[key];
      }
    };
  }
});
define("ember-data/-private/system/model/model", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/promise-proxies", "ember-data/-private/system/model/errors", "ember-data/-private/system/debug/debug-info", "ember-data/-private/system/relationships/belongs-to", "ember-data/-private/system/relationships/has-many", "ember-data/-private/system/relationships/ext", "ember-data/-private/system/model/attr", "ember-data/-private/features"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemPromiseProxies, _emberDataPrivateSystemModelErrors, _emberDataPrivateSystemDebugDebugInfo, _emberDataPrivateSystemRelationshipsBelongsTo, _emberDataPrivateSystemRelationshipsHasMany, _emberDataPrivateSystemRelationshipsExt, _emberDataPrivateSystemModelAttr, _emberDataPrivateFeatures) {

  /**
    @module ember-data
  */

  var get = _ember.default.get;

  function intersection(array1, array2) {
    var result = [];
    array1.forEach(function (element) {
      if (array2.indexOf(element) >= 0) {
        result.push(element);
      }
    });

    return result;
  }

  var RESERVED_MODEL_PROPS = ['currentState', 'data', 'store'];

  var retrieveFromCurrentState = _ember.default.computed('currentState', function (key) {
    return get(this._internalModel.currentState, key);
  }).readOnly();

  /**
  
    The model class that all Ember Data records descend from.
    This is the public API of Ember Data models. If you are using Ember Data
    in your application, this is the class you should use.
    If you are working on Ember Data internals, you most likely want to be dealing
    with `InternalModel`
  
    @class Model
    @namespace DS
    @extends Ember.Object
    @uses Ember.Evented
  */
  var Model = _ember.default.Object.extend(_ember.default.Evented, {
    _internalModel: null,
    store: null,

    /**
      If this property is `true` the record is in the `empty`
      state. Empty is the first state all records enter after they have
      been created. Most records created by the store will quickly
      transition to the `loading` state if data needs to be fetched from
      the server or the `created` state if the record is created on the
      client. A record can also enter the empty state if the adapter is
      unable to locate the record.
       @property isEmpty
      @type {Boolean}
      @readOnly
    */
    isEmpty: retrieveFromCurrentState,
    /**
      If this property is `true` the record is in the `loading` state. A
      record enters this state when the store asks the adapter for its
      data. It remains in this state until the adapter provides the
      requested data.
       @property isLoading
      @type {Boolean}
      @readOnly
    */
    isLoading: retrieveFromCurrentState,
    /**
      If this property is `true` the record is in the `loaded` state. A
      record enters this state when its data is populated. Most of a
      record's lifecycle is spent inside substates of the `loaded`
      state.
       Example
       ```javascript
      var record = store.createRecord('model');
      record.get('isLoaded'); // true
       store.findRecord('model', 1).then(function(model) {
        model.get('isLoaded'); // true
      });
      ```
       @property isLoaded
      @type {Boolean}
      @readOnly
    */
    isLoaded: retrieveFromCurrentState,
    /**
      If this property is `true` the record is in the `dirty` state. The
      record has local changes that have not yet been saved by the
      adapter. This includes records that have been created (but not yet
      saved) or deleted.
       Example
       ```javascript
      var record = store.createRecord('model');
      record.get('hasDirtyAttributes'); // true
       store.findRecord('model', 1).then(function(model) {
        model.get('hasDirtyAttributes'); // false
        model.set('foo', 'some value');
        model.get('hasDirtyAttributes'); // true
      });
      ```
       @since 1.13.0
      @property hasDirtyAttributes
      @type {Boolean}
      @readOnly
    */
    hasDirtyAttributes: _ember.default.computed('currentState.isDirty', function () {
      return this.get('currentState.isDirty');
    }),
    /**
      If this property is `true` the record is in the `saving` state. A
      record enters the saving state when `save` is called, but the
      adapter has not yet acknowledged that the changes have been
      persisted to the backend.
       Example
       ```javascript
      var record = store.createRecord('model');
      record.get('isSaving'); // false
      var promise = record.save();
      record.get('isSaving'); // true
      promise.then(function() {
        record.get('isSaving'); // false
      });
      ```
       @property isSaving
      @type {Boolean}
      @readOnly
    */
    isSaving: retrieveFromCurrentState,
    /**
      If this property is `true` the record is in the `deleted` state
      and has been marked for deletion. When `isDeleted` is true and
      `hasDirtyAttributes` is true, the record is deleted locally but the deletion
      was not yet persisted. When `isSaving` is true, the change is
      in-flight. When both `hasDirtyAttributes` and `isSaving` are false, the
      change has persisted.
       Example
       ```javascript
      var record = store.createRecord('model');
      record.get('isDeleted');    // false
      record.deleteRecord();
       // Locally deleted
      record.get('isDeleted');           // true
      record.get('hasDirtyAttributes');  // true
      record.get('isSaving');            // false
       // Persisting the deletion
      var promise = record.save();
      record.get('isDeleted');    // true
      record.get('isSaving');     // true
       // Deletion Persisted
      promise.then(function() {
        record.get('isDeleted');          // true
        record.get('isSaving');           // false
        record.get('hasDirtyAttributes'); // false
      });
      ```
       @property isDeleted
      @type {Boolean}
      @readOnly
    */
    isDeleted: retrieveFromCurrentState,
    /**
      If this property is `true` the record is in the `new` state. A
      record will be in the `new` state when it has been created on the
      client and the adapter has not yet report that it was successfully
      saved.
       Example
       ```javascript
      var record = store.createRecord('model');
      record.get('isNew'); // true
       record.save().then(function(model) {
        model.get('isNew'); // false
      });
      ```
       @property isNew
      @type {Boolean}
      @readOnly
    */
    isNew: retrieveFromCurrentState,
    /**
      If this property is `true` the record is in the `valid` state.
       A record will be in the `valid` state when the adapter did not report any
      server-side validation failures.
       @property isValid
      @type {Boolean}
      @readOnly
    */
    isValid: retrieveFromCurrentState,
    /**
      If the record is in the dirty state this property will report what
      kind of change has caused it to move into the dirty
      state. Possible values are:
       - `created` The record has been created by the client and not yet saved to the adapter.
      - `updated` The record has been updated by the client and not yet saved to the adapter.
      - `deleted` The record has been deleted by the client and not yet saved to the adapter.
       Example
       ```javascript
      var record = store.createRecord('model');
      record.get('dirtyType'); // 'created'
      ```
       @property dirtyType
      @type {String}
      @readOnly
    */
    dirtyType: retrieveFromCurrentState,

    /**
      If `true` the adapter reported that it was unable to save local
      changes to the backend for any reason other than a server-side
      validation error.
       Example
       ```javascript
      record.get('isError'); // false
      record.set('foo', 'valid value');
      record.save().then(null, function() {
        record.get('isError'); // true
      });
      ```
       @property isError
      @type {Boolean}
      @readOnly
    */
    isError: false,

    /**
      If `true` the store is attempting to reload the record form the adapter.
       Example
       ```javascript
      record.get('isReloading'); // false
      record.reload();
      record.get('isReloading'); // true
      ```
       @property isReloading
      @type {Boolean}
      @readOnly
    */
    isReloading: false,

    /**
      All ember models have an id property. This is an identifier
      managed by an external source. These are always coerced to be
      strings before being used internally. Note when declaring the
      attributes for a model it is an error to declare an id
      attribute.
       ```javascript
      var record = store.createRecord('model');
      record.get('id'); // null
       store.findRecord('model', 1).then(function(model) {
        model.get('id'); // '1'
      });
      ```
       @property id
      @type {String}
    */
    id: null,

    /**
      @property currentState
      @private
      @type {Object}
    */

    /**
      When the record is in the `invalid` state this object will contain
      any errors returned by the adapter. When present the errors hash
      contains keys corresponding to the invalid property names
      and values which are arrays of Javascript objects with two keys:
       - `message` A string containing the error message from the backend
      - `attribute` The name of the property associated with this error message
       ```javascript
      record.get('errors.length'); // 0
      record.set('foo', 'invalid value');
      record.save().catch(function() {
        record.get('errors').get('foo');
        // [{message: 'foo should be a number.', attribute: 'foo'}]
      });
      ```
       The `errors` property us useful for displaying error messages to
      the user.
       ```handlebars
      <label>Username: {{input value=username}} </label>
      {{#each model.errors.username as |error|}}
        <div class="error">
          {{error.message}}
        </div>
      {{/each}}
      <label>Email: {{input value=email}} </label>
      {{#each model.errors.email as |error|}}
        <div class="error">
          {{error.message}}
        </div>
      {{/each}}
      ```
        You can also access the special `messages` property on the error
      object to get an array of all the error strings.
       ```handlebars
      {{#each model.errors.messages as |message|}}
        <div class="error">
          {{message}}
        </div>
      {{/each}}
      ```
       @property errors
      @type {DS.Errors}
    */
    errors: _ember.default.computed(function () {
      var errors = _emberDataPrivateSystemModelErrors.default.create();

      errors._registerHandlers(this._internalModel, function () {
        this.send('becameInvalid');
      }, function () {
        this.send('becameValid');
      });
      return errors;
    }).readOnly(),

    /**
      This property holds the `DS.AdapterError` object with which
      last adapter operation was rejected.
       @property adapterError
      @type {DS.AdapterError}
    */
    adapterError: null,

    /**
      Create a JSON representation of the record, using the serialization
      strategy of the store's adapter.
      `serialize` takes an optional hash as a parameter, currently
      supported options are:
      - `includeId`: `true` if the record's ID should be included in the
        JSON representation.
       @method serialize
      @param {Object} options
      @return {Object} an object whose values are primitive JSON values only
    */
    serialize: function (options) {
      return this.store.serialize(this, options);
    },

    /**
      Use [DS.JSONSerializer](DS.JSONSerializer.html) to
      get the JSON representation of a record.
       `toJSON` takes an optional hash as a parameter, currently
      supported options are:
       - `includeId`: `true` if the record's ID should be included in the
        JSON representation.
       @method toJSON
      @param {Object} options
      @return {Object} A JSON representation of the object.
    */
    toJSON: function (options) {
      // container is for lazy transform lookups
      var serializer = this.store.serializerFor('-default');
      var snapshot = this._internalModel.createSnapshot();

      return serializer.serialize(snapshot, options);
    },

    /**
      Fired when the record is ready to be interacted with,
      that is either loaded from the server or created locally.
       @event ready
    */
    ready: _ember.default.K,

    /**
      Fired when the record is loaded from the server.
       @event didLoad
    */
    didLoad: _ember.default.K,

    /**
      Fired when the record is updated.
       @event didUpdate
    */
    didUpdate: _ember.default.K,

    /**
      Fired when a new record is commited to the server.
       @event didCreate
    */
    didCreate: _ember.default.K,

    /**
      Fired when the record is deleted.
       @event didDelete
    */
    didDelete: _ember.default.K,

    /**
      Fired when the record becomes invalid.
       @event becameInvalid
    */
    becameInvalid: _ember.default.K,

    /**
      Fired when the record enters the error state.
       @event becameError
    */
    becameError: _ember.default.K,

    /**
      Fired when the record is rolled back.
       @event rolledBack
    */
    rolledBack: _ember.default.K,

    //TODO Do we want to deprecate these?
    /**
      @method send
      @private
      @param {String} name
      @param {Object} context
    */
    send: function (name, context) {
      return this._internalModel.send(name, context);
    },

    /**
      @method transitionTo
      @private
      @param {String} name
    */
    transitionTo: function (name) {
      return this._internalModel.transitionTo(name);
    },

    /**
      Marks the record as deleted but does not save it. You must call
      `save` afterwards if you want to persist it. You might use this
      method if you want to allow the user to still `rollbackAttributes()`
      after a delete it was made.
       Example
       ```app/routes/model/delete.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        actions: {
          softDelete: function() {
            this.controller.get('model').deleteRecord();
          },
          confirm: function() {
            this.controller.get('model').save();
          },
          undo: function() {
            this.controller.get('model').rollbackAttributes();
          }
        }
      });
      ```
       @method deleteRecord
    */
    deleteRecord: function () {
      this._internalModel.deleteRecord();
    },

    /**
      Same as `deleteRecord`, but saves the record immediately.
       Example
       ```app/routes/model/delete.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        actions: {
          delete: function() {
            var controller = this.controller;
            controller.get('model').destroyRecord().then(function() {
              controller.transitionToRoute('model.index');
            });
          }
        }
      });
      ```
       If you pass an object on the `adapterOptions` property of the options
      argument it will be passed to you adapter via the snapshot
       ```js
      record.destroyRecord({ adapterOptions: { subscribe: false } });
      ```
       ```app/adapters/post.js
      import MyCustomAdapter from './custom-adapter';
       export default MyCustomAdapter.extend({
        deleteRecord: function(store, type, snapshot) {
          if (snapshot.adapterOptions.subscribe) {
            // ...
          }
          // ...
        }
      });
      ```
       @method destroyRecord
      @param {Object} options
      @return {Promise} a promise that will be resolved when the adapter returns
      successfully or rejected if the adapter returns with an error.
    */
    destroyRecord: function (options) {
      this.deleteRecord();
      return this.save(options);
    },

    /**
      @method unloadRecord
      @private
    */
    unloadRecord: function () {
      if (this.isDestroyed) {
        return;
      }
      this._internalModel.unloadRecord();
    },

    /**
      @method _notifyProperties
      @private
    */
    _notifyProperties: function (keys) {
      _ember.default.beginPropertyChanges();
      var key;
      for (var i = 0, length = keys.length; i < length; i++) {
        key = keys[i];
        this.notifyPropertyChange(key);
      }
      _ember.default.endPropertyChanges();
    },

    /**
      Returns an object, whose keys are changed properties, and value is
      an [oldProp, newProp] array.
       The array represents the diff of the canonical state with the local state
      of the model. Note: if the model is created locally, the canonical state is
      empty since the adapter hasn't acknowledged the attributes yet:
       Example
       ```app/models/mascot.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        name: attr('string'),
        isAdmin: attr('boolean', {
          defaultValue: false
        })
      });
      ```
       ```javascript
      var mascot = store.createRecord('mascot');
       mascot.changedAttributes(); // {}
       mascot.set('name', 'Tomster');
      mascot.changedAttributes(); // { name: [undefined, 'Tomster'] }
       mascot.set('isAdmin', true);
      mascot.changedAttributes(); // { isAdmin: [undefined, true], name: [undefined, 'Tomster'] }
       mascot.save().then(function() {
        mascot.changedAttributes(); // {}
         mascot.set('isAdmin', false);
        mascot.changedAttributes(); // { isAdmin: [true, false] }
      });
      ```
       @method changedAttributes
      @return {Object} an object, whose keys are changed properties,
        and value is an [oldProp, newProp] array.
    */
    changedAttributes: function () {
      return this._internalModel.changedAttributes();
    },

    //TODO discuss with tomhuda about events/hooks
    //Bring back as hooks?
    /**
      @method adapterWillCommit
      @private
    adapterWillCommit: function() {
      this.send('willCommit');
    },
     /**
      @method adapterDidDirty
      @private
    adapterDidDirty: function() {
      this.send('becomeDirty');
      this.updateRecordArraysLater();
    },
    */

    /**
      If the model `hasDirtyAttributes` this function will discard any unsaved
      changes. If the model `isNew` it will be removed from the store.
       Example
       ```javascript
      record.get('name'); // 'Untitled Document'
      record.set('name', 'Doc 1');
      record.get('name'); // 'Doc 1'
      record.rollbackAttributes();
      record.get('name'); // 'Untitled Document'
      ```
       @since 1.13.0
      @method rollbackAttributes
    */
    rollbackAttributes: function () {
      this._internalModel.rollbackAttributes();
    },

    /*
      @method _createSnapshot
      @private
    */
    _createSnapshot: function () {
      return this._internalModel.createSnapshot();
    },

    toStringExtension: function () {
      return get(this, 'id');
    },

    /**
      Save the record and persist any changes to the record to an
      external source via the adapter.
       Example
       ```javascript
      record.set('name', 'Tomster');
      record.save().then(function() {
        // Success callback
      }, function() {
        // Error callback
      });
      ```
      If you pass an object on the `adapterOptions` property of the options
     argument it will be passed to you adapter via the snapshot
       ```js
      record.save({ adapterOptions: { subscribe: false } });
      ```
       ```app/adapters/post.js
      import MyCustomAdapter from './custom-adapter';
       export default MyCustomAdapter.extend({
        updateRecord: function(store, type, snapshot) {
          if (snapshot.adapterOptions.subscribe) {
            // ...
          }
          // ...
        }
      });
      ```
       @method save
      @param {Object} options
      @return {Promise} a promise that will be resolved when the adapter returns
      successfully or rejected if the adapter returns with an error.
    */
    save: function (options) {
      var _this = this;

      return _emberDataPrivateSystemPromiseProxies.PromiseObject.create({
        promise: this._internalModel.save(options).then(function () {
          return _this;
        })
      });
    },

    /**
      Reload the record from the adapter.
       This will only work if the record has already finished loading.
       Example
       ```app/routes/model/view.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        actions: {
          reload: function() {
            this.controller.get('model').reload().then(function(model) {
              // do something with the reloaded model
            });
          }
        }
      });
      ```
       @method reload
      @return {Promise} a promise that will be resolved with the record when the
      adapter returns successfully or rejected if the adapter returns
      with an error.
    */
    reload: function () {
      var _this2 = this;

      return _emberDataPrivateSystemPromiseProxies.PromiseObject.create({
        promise: this._internalModel.reload().then(function () {
          return _this2;
        })
      });
    },

    /**
      Override the default event firing from Ember.Evented to
      also call methods with the given name.
       @method trigger
      @private
      @param {String} name
    */
    trigger: function (name) {
      var length = arguments.length;
      var args = new Array(length - 1);

      for (var i = 1; i < length; i++) {
        args[i - 1] = arguments[i];
      }

      _ember.default.tryInvoke(this, name, args);
      this._super.apply(this, arguments);
    },

    willDestroy: function () {
      //TODO Move!
      this._super.apply(this, arguments);
      this._internalModel.clearRelationships();
      this._internalModel.recordObjectWillDestroy();
      //TODO should we set internalModel to null here?
    },

    // This is a temporary solution until we refactor DS.Model to not
    // rely on the data property.
    willMergeMixin: function (props) {
      var constructor = this.constructor;
    },

    attr: function () {},

    /**
      Get the reference for the specified belongsTo relationship.
       Example
       ```javascript
      // models/blog.js
      export default DS.Model.extend({
        user: DS.belongsTo({ async: true })
      });
       var blog = store.push({
        type: 'blog',
        id: 1,
        relationships: {
          user: { type: 'user', id: 1 }
        }
      });
      var userRef = blog.belongsTo('user');
       // check if the user relationship is loaded
      var isLoaded = userRef.value() !== null;
       // get the record of the reference (null if not yet available)
      var user = userRef.value();
       // get the identifier of the reference
      if (userRef.remoteType() === "id") {
        var id = userRef.id();
      } else if (userRef.remoteType() === "link") {
        var link = userRef.link();
      }
       // load user (via store.findRecord or store.findBelongsTo)
      userRef.load().then(...)
       // or trigger a reload
      userRef.reload().then(...)
       // provide data for reference
      userRef.push({
        type: 'user',
        id: 1,
        attributes: {
          username: "@user"
        }
      }).then(function(user) {
        userRef.value() === user;
      });
      ```
       @method belongsTo
      @param {String} name of the relationship
      @since 2.5.0
      @return {BelongsToReference} reference for this relationship
    */
    belongsTo: function (name) {
      return this._internalModel.referenceFor('belongsTo', name);
    },

    /**
      Get the reference for the specified hasMany relationship.
       Example
       ```javascript
      // models/blog.js
      export default DS.Model.extend({
        comments: DS.hasMany({ async: true })
      });
       var blog = store.push({
        type: 'blog',
        id: 1,
        relationships: {
          comments: {
            data: [
              { type: 'comment', id: 1 },
              { type: 'comment', id: 2 }
            ]
          }
        }
      });
      var commentsRef = blog.hasMany('comments');
       // check if the comments are loaded already
      var isLoaded = commentsRef.value() !== null;
       // get the records of the reference (null if not yet available)
      var comments = commentsRef.value();
       // get the identifier of the reference
      if (commentsRef.remoteType() === "ids") {
        var ids = commentsRef.ids();
      } else if (commentsRef.remoteType() === "link") {
        var link = commentsRef.link();
      }
       // load comments (via store.findMany or store.findHasMany)
      commentsRef.load().then(...)
       // or trigger a reload
      commentsRef.reload().then(...)
       // provide data for reference
      commentsRef.push([{ type: 'comment', id: 1 }, { type: 'comment', id: 2 }]).then(function(comments) {
        commentsRef.value() === comments;
      });
      ```
       @method hasMany
      @param {String} name of the relationship
      @since 2.5.0
      @return {HasManyReference} reference for this relationship
    */
    hasMany: function (name) {
      return this._internalModel.referenceFor('hasMany', name);
    },

    setId: _ember.default.observer('id', function () {
      this._internalModel.setId(this.get('id'));
    })
  });

  /**
   @property data
   @private
   @type {Object}
   */
  Object.defineProperty(Model.prototype, 'data', {
    get: function () {
      return this._internalModel._data;
    }
  });

  Model.reopenClass({
    /**
      Alias DS.Model's `create` method to `_create`. This allows us to create DS.Model
      instances from within the store, but if end users accidentally call `create()`
      (instead of `createRecord()`), we can raise an error.
       @method _create
      @private
      @static
    */
    _create: Model.create,

    /**
      Override the class' `create()` method to raise an error. This
      prevents end users from inadvertently calling `create()` instead
      of `createRecord()`. The store is still able to create instances
      by calling the `_create()` method. To create an instance of a
      `DS.Model` use [store.createRecord](DS.Store.html#method_createRecord).
       @method create
      @private
      @static
    */
    create: function () {
      throw new _ember.default.Error("You should not call `create` on a model. Instead, call `store.createRecord` with the attributes you would like to set.");
    },

    /**
     Represents the model's class name as a string. This can be used to look up the model through
     DS.Store's modelFor method.
      `modelName` is generated for you by Ember Data. It will be a lowercased, dasherized string.
     For example:
      ```javascript
     store.modelFor('post').modelName; // 'post'
     store.modelFor('blog-post').modelName; // 'blog-post'
     ```
      The most common place you'll want to access `modelName` is in your serializer's `payloadKeyFromModelName` method. For example, to change payload
     keys to underscore (instead of dasherized), you might use the following code:
      ```javascript
     export default var PostSerializer = DS.RESTSerializer.extend({
       payloadKeyFromModelName: function(modelName) {
         return Ember.String.underscore(modelName);
       }
     });
     ```
     @property modelName
     @type String
     @readonly
     @static
    */
    modelName: null
  });

  // if `Ember.setOwner` is defined, accessing `this.container` is
  // deprecated (but functional). In "standard" Ember usage, this
  // deprecation is actually created via an `.extend` of the factory
  // inside the container itself, but that only happens on models
  // with MODEL_FACTORY_INJECTIONS enabled :(
  if (_ember.default.setOwner) {
    Object.defineProperty(Model.prototype, 'container', {
      configurable: true,
      enumerable: false,
      get: function () {

        return this.store.container;
      }
    });
  }

  if (false) {
    Model.reopen({
      /**
        Discards any unsaved changes to the given attribute.
         Example
         ```javascript
        record.get('name'); // 'Untitled Document'
        record.set('name', 'Doc 1');
        record.get('name'); // 'Doc 1'
        record.resetAttribute('name');
        record.get('name'); // 'Untitled Document'
        ```
         @method resetAttribute
      */
      resetAttribute: function (attributeName) {
        if (attributeName in this._internalModel._attributes) {
          this.set(attributeName, this._internalModel.lastAcknowledgedValue(attributeName));
        }
      }
    });
  }

  Model.reopenClass(_emberDataPrivateSystemRelationshipsExt.RelationshipsClassMethodsMixin);
  Model.reopenClass(_emberDataPrivateSystemModelAttr.AttrClassMethodsMixin);

  exports.default = Model.extend(_emberDataPrivateSystemDebugDebugInfo.default, _emberDataPrivateSystemRelationshipsBelongsTo.BelongsToMixin, _emberDataPrivateSystemRelationshipsExt.DidDefinePropertyMixin, _emberDataPrivateSystemRelationshipsExt.RelationshipsInstanceMethodsMixin, _emberDataPrivateSystemRelationshipsHasMany.HasManyMixin, _emberDataPrivateSystemModelAttr.AttrInstanceMethodsMixin);
});
define('ember-data/-private/system/model/states', ['exports', 'ember', 'ember-data/-private/debug'], function (exports, _ember, _emberDataPrivateDebug) {

  var get = _ember.default.get;
  /*
    This file encapsulates the various states that a record can transition
    through during its lifecycle.
  */
  /**
    ### State
  
    Each record has a `currentState` property that explicitly tracks what
    state a record is in at any given time. For instance, if a record is
    newly created and has not yet been sent to the adapter to be saved,
    it would be in the `root.loaded.created.uncommitted` state.  If a
    record has had local modifications made to it that are in the
    process of being saved, the record would be in the
    `root.loaded.updated.inFlight` state. (This state paths will be
    explained in more detail below.)
  
    Events are sent by the record or its store to the record's
    `currentState` property. How the state reacts to these events is
    dependent on which state it is in. In some states, certain events
    will be invalid and will cause an exception to be raised.
  
    States are hierarchical and every state is a substate of the
    `RootState`. For example, a record can be in the
    `root.deleted.uncommitted` state, then transition into the
    `root.deleted.inFlight` state. If a child state does not implement
    an event handler, the state manager will attempt to invoke the event
    on all parent states until the root state is reached. The state
    hierarchy of a record is described in terms of a path string. You
    can determine a record's current state by getting the state's
    `stateName` property:
  
    ```javascript
    record.get('currentState.stateName');
    //=> "root.created.uncommitted"
     ```
  
    The hierarchy of valid states that ship with ember data looks like
    this:
  
    ```text
    * root
      * deleted
        * saved
        * uncommitted
        * inFlight
      * empty
      * loaded
        * created
          * uncommitted
          * inFlight
        * saved
        * updated
          * uncommitted
          * inFlight
      * loading
    ```
  
    The `DS.Model` states are themselves stateless. What that means is
    that, the hierarchical states that each of *those* points to is a
    shared data structure. For performance reasons, instead of each
    record getting its own copy of the hierarchy of states, each record
    points to this global, immutable shared instance. How does a state
    know which record it should be acting on? We pass the record
    instance into the state's event handlers as the first argument.
  
    The record passed as the first parameter is where you should stash
    state about the record if needed; you should never store data on the state
    object itself.
  
    ### Events and Flags
  
    A state may implement zero or more events and flags.
  
    #### Events
  
    Events are named functions that are invoked when sent to a record. The
    record will first look for a method with the given name on the
    current state. If no method is found, it will search the current
    state's parent, and then its grandparent, and so on until reaching
    the top of the hierarchy. If the root is reached without an event
    handler being found, an exception will be raised. This can be very
    helpful when debugging new features.
  
    Here's an example implementation of a state with a `myEvent` event handler:
  
    ```javascript
    aState: DS.State.create({
      myEvent: function(manager, param) {
        console.log("Received myEvent with", param);
      }
    })
    ```
  
    To trigger this event:
  
    ```javascript
    record.send('myEvent', 'foo');
    //=> "Received myEvent with foo"
    ```
  
    Note that an optional parameter can be sent to a record's `send()` method,
    which will be passed as the second parameter to the event handler.
  
    Events should transition to a different state if appropriate. This can be
    done by calling the record's `transitionTo()` method with a path to the
    desired state. The state manager will attempt to resolve the state path
    relative to the current state. If no state is found at that path, it will
    attempt to resolve it relative to the current state's parent, and then its
    parent, and so on until the root is reached. For example, imagine a hierarchy
    like this:
  
        * created
          * uncommitted <-- currentState
          * inFlight
        * updated
          * inFlight
  
    If we are currently in the `uncommitted` state, calling
    `transitionTo('inFlight')` would transition to the `created.inFlight` state,
    while calling `transitionTo('updated.inFlight')` would transition to
    the `updated.inFlight` state.
  
    Remember that *only events* should ever cause a state transition. You should
    never call `transitionTo()` from outside a state's event handler. If you are
    tempted to do so, create a new event and send that to the state manager.
  
    #### Flags
  
    Flags are Boolean values that can be used to introspect a record's current
    state in a more user-friendly way than examining its state path. For example,
    instead of doing this:
  
    ```javascript
    var statePath = record.get('stateManager.currentPath');
    if (statePath === 'created.inFlight') {
      doSomething();
    }
    ```
  
    You can say:
  
    ```javascript
    if (record.get('isNew') && record.get('isSaving')) {
      doSomething();
    }
    ```
  
    If your state does not set a value for a given flag, the value will
    be inherited from its parent (or the first place in the state hierarchy
    where it is defined).
  
    The current set of flags are defined below. If you want to add a new flag,
    in addition to the area below, you will also need to declare it in the
    `DS.Model` class.
  
  
     * [isEmpty](DS.Model.html#property_isEmpty)
     * [isLoading](DS.Model.html#property_isLoading)
     * [isLoaded](DS.Model.html#property_isLoaded)
     * [isDirty](DS.Model.html#property_isDirty)
     * [isSaving](DS.Model.html#property_isSaving)
     * [isDeleted](DS.Model.html#property_isDeleted)
     * [isNew](DS.Model.html#property_isNew)
     * [isValid](DS.Model.html#property_isValid)
  
    @namespace DS
    @class RootState
  */

  function didSetProperty(internalModel, context) {
    if (context.value === context.originalValue) {
      delete internalModel._attributes[context.name];
      internalModel.send('propertyWasReset', context.name);
    } else if (context.value !== context.oldValue) {
      internalModel.send('becomeDirty');
    }

    internalModel.updateRecordArraysLater();
  }

  // Implementation notes:
  //
  // Each state has a boolean value for all of the following flags:
  //
  // * isLoaded: The record has a populated `data` property. When a
  //   record is loaded via `store.find`, `isLoaded` is false
  //   until the adapter sets it. When a record is created locally,
  //   its `isLoaded` property is always true.
  // * isDirty: The record has local changes that have not yet been
  //   saved by the adapter. This includes records that have been
  //   created (but not yet saved) or deleted.
  // * isSaving: The record has been committed, but
  //   the adapter has not yet acknowledged that the changes have
  //   been persisted to the backend.
  // * isDeleted: The record was marked for deletion. When `isDeleted`
  //   is true and `isDirty` is true, the record is deleted locally
  //   but the deletion was not yet persisted. When `isSaving` is
  //   true, the change is in-flight. When both `isDirty` and
  //   `isSaving` are false, the change has persisted.
  // * isNew: The record was created on the client and the adapter
  //   did not yet report that it was successfully saved.
  // * isValid: The adapter did not report any server-side validation
  //   failures.

  // The dirty state is a abstract state whose functionality is
  // shared between the `created` and `updated` states.
  //
  // The deleted state shares the `isDirty` flag with the
  // subclasses of `DirtyState`, but with a very different
  // implementation.
  //
  // Dirty states have three child states:
  //
  // `uncommitted`: the store has not yet handed off the record
  //   to be saved.
  // `inFlight`: the store has handed off the record to be saved,
  //   but the adapter has not yet acknowledged success.
  // `invalid`: the record has invalid information and cannot be
  //   sent to the adapter yet.
  var DirtyState = {
    initialState: 'uncommitted',

    // FLAGS
    isDirty: true,

    // SUBSTATES

    // When a record first becomes dirty, it is `uncommitted`.
    // This means that there are local pending changes, but they
    // have not yet begun to be saved, and are not invalid.
    uncommitted: {
      // EVENTS
      didSetProperty: didSetProperty,

      //TODO(Igor) reloading now triggers a
      //loadingData event, though it seems fine?
      loadingData: _ember.default.K,

      propertyWasReset: function (internalModel, name) {
        if (!internalModel.hasChangedAttributes()) {
          internalModel.send('rolledBack');
        }
      },

      pushedData: function (internalModel) {
        internalModel.updateChangedAttributes();

        if (!internalModel.hasChangedAttributes()) {
          internalModel.transitionTo('loaded.saved');
        }
      },

      becomeDirty: _ember.default.K,

      willCommit: function (internalModel) {
        internalModel.transitionTo('inFlight');
      },

      reloadRecord: function (internalModel, resolve) {
        resolve(internalModel.store.reloadRecord(internalModel));
      },

      rolledBack: function (internalModel) {
        internalModel.transitionTo('loaded.saved');
      },

      becameInvalid: function (internalModel) {
        internalModel.transitionTo('invalid');
      },

      rollback: function (internalModel) {
        internalModel.rollbackAttributes();
        internalModel.triggerLater('ready');
      }
    },

    // Once a record has been handed off to the adapter to be
    // saved, it is in the 'in flight' state. Changes to the
    // record cannot be made during this window.
    inFlight: {
      // FLAGS
      isSaving: true,

      // EVENTS
      didSetProperty: didSetProperty,
      becomeDirty: _ember.default.K,
      pushedData: _ember.default.K,

      unloadRecord: assertAgainstUnloadRecord,

      // TODO: More robust semantics around save-while-in-flight
      willCommit: _ember.default.K,

      didCommit: function (internalModel) {
        var dirtyType = get(this, 'dirtyType');

        internalModel.transitionTo('saved');
        internalModel.send('invokeLifecycleCallbacks', dirtyType);
      },

      becameInvalid: function (internalModel) {
        internalModel.transitionTo('invalid');
        internalModel.send('invokeLifecycleCallbacks');
      },

      becameError: function (internalModel) {
        internalModel.transitionTo('uncommitted');
        internalModel.triggerLater('becameError', internalModel);
      }
    },

    // A record is in the `invalid` if the adapter has indicated
    // the the record failed server-side invalidations.
    invalid: {
      // FLAGS
      isValid: false,

      // EVENTS
      deleteRecord: function (internalModel) {
        internalModel.transitionTo('deleted.uncommitted');
      },

      didSetProperty: function (internalModel, context) {
        internalModel.removeErrorMessageFromAttribute(context.name);

        didSetProperty(internalModel, context);

        if (!internalModel.hasErrors()) {
          this.becameValid(internalModel);
        }
      },

      becameInvalid: _ember.default.K,
      becomeDirty: _ember.default.K,
      pushedData: _ember.default.K,

      willCommit: function (internalModel) {
        internalModel.clearErrorMessages();
        internalModel.transitionTo('inFlight');
      },

      rolledBack: function (internalModel) {
        internalModel.clearErrorMessages();
        internalModel.transitionTo('loaded.saved');
        internalModel.triggerLater('ready');
      },

      becameValid: function (internalModel) {
        internalModel.transitionTo('uncommitted');
      },

      invokeLifecycleCallbacks: function (internalModel) {
        internalModel.triggerLater('becameInvalid', internalModel);
      }
    }
  };

  // The created and updated states are created outside the state
  // chart so we can reopen their substates and add mixins as
  // necessary.

  function deepClone(object) {
    var clone = {};
    var value;

    for (var prop in object) {
      value = object[prop];
      if (value && typeof value === 'object') {
        clone[prop] = deepClone(value);
      } else {
        clone[prop] = value;
      }
    }

    return clone;
  }

  function mixin(original, hash) {
    for (var prop in hash) {
      original[prop] = hash[prop];
    }

    return original;
  }

  function dirtyState(options) {
    var newState = deepClone(DirtyState);
    return mixin(newState, options);
  }

  var createdState = dirtyState({
    dirtyType: 'created',
    // FLAGS
    isNew: true
  });

  createdState.invalid.rolledBack = function (internalModel) {
    internalModel.transitionTo('deleted.saved');
  };
  createdState.uncommitted.rolledBack = function (internalModel) {
    internalModel.transitionTo('deleted.saved');
  };

  var updatedState = dirtyState({
    dirtyType: 'updated'
  });

  function createdStateDeleteRecord(internalModel) {
    internalModel.transitionTo('deleted.saved');
    internalModel.send('invokeLifecycleCallbacks');
  }

  createdState.uncommitted.deleteRecord = createdStateDeleteRecord;

  createdState.invalid.deleteRecord = createdStateDeleteRecord;

  createdState.uncommitted.rollback = function (internalModel) {
    DirtyState.uncommitted.rollback.apply(this, arguments);
    internalModel.transitionTo('deleted.saved');
  };

  createdState.uncommitted.pushedData = function (internalModel) {
    internalModel.transitionTo('loaded.updated.uncommitted');
    internalModel.triggerLater('didLoad');
  };

  createdState.uncommitted.propertyWasReset = _ember.default.K;

  function assertAgainstUnloadRecord(internalModel) {}

  updatedState.inFlight.unloadRecord = assertAgainstUnloadRecord;

  updatedState.uncommitted.deleteRecord = function (internalModel) {
    internalModel.transitionTo('deleted.uncommitted');
  };

  var RootState = {
    // FLAGS
    isEmpty: false,
    isLoading: false,
    isLoaded: false,
    isDirty: false,
    isSaving: false,
    isDeleted: false,
    isNew: false,
    isValid: true,

    // DEFAULT EVENTS

    // Trying to roll back if you're not in the dirty state
    // doesn't change your state. For example, if you're in the
    // in-flight state, rolling back the record doesn't move
    // you out of the in-flight state.
    rolledBack: _ember.default.K,
    unloadRecord: function (internalModel) {
      // clear relationships before moving to deleted state
      // otherwise it fails
      internalModel.clearRelationships();
      internalModel.transitionTo('deleted.saved');
    },

    propertyWasReset: _ember.default.K,

    // SUBSTATES

    // A record begins its lifecycle in the `empty` state.
    // If its data will come from the adapter, it will
    // transition into the `loading` state. Otherwise, if
    // the record is being created on the client, it will
    // transition into the `created` state.
    empty: {
      isEmpty: true,

      // EVENTS
      loadingData: function (internalModel, promise) {
        internalModel._loadingPromise = promise;
        internalModel.transitionTo('loading');
      },

      loadedData: function (internalModel) {
        internalModel.transitionTo('loaded.created.uncommitted');
        internalModel.triggerLater('ready');
      },

      pushedData: function (internalModel) {
        internalModel.transitionTo('loaded.saved');
        internalModel.triggerLater('didLoad');
        internalModel.triggerLater('ready');
      }
    },

    // A record enters this state when the store asks
    // the adapter for its data. It remains in this state
    // until the adapter provides the requested data.
    //
    // Usually, this process is asynchronous, using an
    // XHR to retrieve the data.
    loading: {
      // FLAGS
      isLoading: true,

      exit: function (internalModel) {
        internalModel._loadingPromise = null;
      },

      // EVENTS
      pushedData: function (internalModel) {
        internalModel.transitionTo('loaded.saved');
        internalModel.triggerLater('didLoad');
        internalModel.triggerLater('ready');
        //TODO this seems out of place here
        internalModel.didCleanError();
      },

      becameError: function (internalModel) {
        internalModel.triggerLater('becameError', internalModel);
      },

      notFound: function (internalModel) {
        internalModel.transitionTo('empty');
      }
    },

    // A record enters this state when its data is populated.
    // Most of a record's lifecycle is spent inside substates
    // of the `loaded` state.
    loaded: {
      initialState: 'saved',

      // FLAGS
      isLoaded: true,

      //TODO(Igor) Reloading now triggers a loadingData event,
      //but it should be ok?
      loadingData: _ember.default.K,

      // SUBSTATES

      // If there are no local changes to a record, it remains
      // in the `saved` state.
      saved: {
        setup: function (internalModel) {
          if (internalModel.hasChangedAttributes()) {
            internalModel.adapterDidDirty();
          }
        },

        // EVENTS
        didSetProperty: didSetProperty,

        pushedData: _ember.default.K,

        becomeDirty: function (internalModel) {
          internalModel.transitionTo('updated.uncommitted');
        },

        willCommit: function (internalModel) {
          internalModel.transitionTo('updated.inFlight');
        },

        reloadRecord: function (internalModel, resolve) {
          resolve(internalModel.store.reloadRecord(internalModel));
        },

        deleteRecord: function (internalModel) {
          internalModel.transitionTo('deleted.uncommitted');
        },

        unloadRecord: function (internalModel) {
          // clear relationships before moving to deleted state
          // otherwise it fails
          internalModel.clearRelationships();
          internalModel.transitionTo('deleted.saved');
        },

        didCommit: function (internalModel) {
          internalModel.send('invokeLifecycleCallbacks', get(internalModel, 'lastDirtyType'));
        },

        // loaded.saved.notFound would be triggered by a failed
        // `reload()` on an unchanged record
        notFound: _ember.default.K

      },

      // A record is in this state after it has been locally
      // created but before the adapter has indicated that
      // it has been saved.
      created: createdState,

      // A record is in this state if it has already been
      // saved to the server, but there are new local changes
      // that have not yet been saved.
      updated: updatedState
    },

    // A record is in this state if it was deleted from the store.
    deleted: {
      initialState: 'uncommitted',
      dirtyType: 'deleted',

      // FLAGS
      isDeleted: true,
      isLoaded: true,
      isDirty: true,

      // TRANSITIONS
      setup: function (internalModel) {
        internalModel.updateRecordArrays();
      },

      // SUBSTATES

      // When a record is deleted, it enters the `start`
      // state. It will exit this state when the record
      // starts to commit.
      uncommitted: {

        // EVENTS

        willCommit: function (internalModel) {
          internalModel.transitionTo('inFlight');
        },

        rollback: function (internalModel) {
          internalModel.rollbackAttributes();
          internalModel.triggerLater('ready');
        },

        pushedData: _ember.default.K,
        becomeDirty: _ember.default.K,
        deleteRecord: _ember.default.K,

        rolledBack: function (internalModel) {
          internalModel.transitionTo('loaded.saved');
          internalModel.triggerLater('ready');
        }
      },

      // After a record starts committing, but
      // before the adapter indicates that the deletion
      // has saved to the server, a record is in the
      // `inFlight` substate of `deleted`.
      inFlight: {
        // FLAGS
        isSaving: true,

        // EVENTS

        unloadRecord: assertAgainstUnloadRecord,

        // TODO: More robust semantics around save-while-in-flight
        willCommit: _ember.default.K,
        didCommit: function (internalModel) {
          internalModel.transitionTo('saved');

          internalModel.send('invokeLifecycleCallbacks');
        },

        becameError: function (internalModel) {
          internalModel.transitionTo('uncommitted');
          internalModel.triggerLater('becameError', internalModel);
        },

        becameInvalid: function (internalModel) {
          internalModel.transitionTo('invalid');
          internalModel.triggerLater('becameInvalid', internalModel);
        }
      },

      // Once the adapter indicates that the deletion has
      // been saved, the record enters the `saved` substate
      // of `deleted`.
      saved: {
        // FLAGS
        isDirty: false,

        setup: function (internalModel) {
          internalModel.clearRelationships();
          var store = internalModel.store;
          store._dematerializeRecord(internalModel);
        },

        invokeLifecycleCallbacks: function (internalModel) {
          internalModel.triggerLater('didDelete', internalModel);
          internalModel.triggerLater('didCommit', internalModel);
        },

        willCommit: _ember.default.K,

        didCommit: _ember.default.K
      },

      invalid: {
        isValid: false,

        didSetProperty: function (internalModel, context) {
          internalModel.removeErrorMessageFromAttribute(context.name);

          didSetProperty(internalModel, context);

          if (!internalModel.hasErrors()) {
            this.becameValid(internalModel);
          }
        },

        becameInvalid: _ember.default.K,
        becomeDirty: _ember.default.K,
        deleteRecord: _ember.default.K,
        willCommit: _ember.default.K,

        rolledBack: function (internalModel) {
          internalModel.clearErrorMessages();
          internalModel.transitionTo('loaded.saved');
          internalModel.triggerLater('ready');
        },

        becameValid: function (internalModel) {
          internalModel.transitionTo('uncommitted');
        }

      }
    },

    invokeLifecycleCallbacks: function (internalModel, dirtyType) {
      if (dirtyType === 'created') {
        internalModel.triggerLater('didCreate', internalModel);
      } else {
        internalModel.triggerLater('didUpdate', internalModel);
      }

      internalModel.triggerLater('didCommit', internalModel);
    }
  };

  function wireState(object, parent, name) {
    // TODO: Use Object.create and copy instead
    object = mixin(parent ? Object.create(parent) : {}, object);
    object.parentState = parent;
    object.stateName = name;

    for (var prop in object) {
      if (!object.hasOwnProperty(prop) || prop === 'parentState' || prop === 'stateName') {
        continue;
      }
      if (typeof object[prop] === 'object') {
        object[prop] = wireState(object[prop], object, name + "." + prop);
      }
    }

    return object;
  }

  RootState = wireState(RootState, null, "root");

  exports.default = RootState;
});
/**
  @module ember-data
*/
define('ember-data/-private/system/normalize-link', ['exports'], function (exports) {
  exports.default = _normalizeLink;
  /*
    This method normalizes a link to an "links object". If the passed link is
    already an object it's returned without any modifications.
  
    See http://jsonapi.org/format/#document-links for more information.
  
    @method _normalizeLink
    @private
    @param {String} link
    @return {Object|null}
    @for DS
  */

  function _normalizeLink(link) {
    switch (typeof link) {
      case 'object':
        return link;
      case 'string':
        return { href: link };
    }
    return null;
  }
});
define('ember-data/-private/system/normalize-model-name', ['exports', 'ember'], function (exports, _ember) {
  exports.default = normalizeModelName;

  // All modelNames are dasherized internally. Changing this function may
  // require changes to other normalization hooks (such as typeForRoot).

  /**
   This method normalizes a modelName into the format Ember Data uses
   internally.
  
    @method normalizeModelName
    @public
    @param {String} modelName
    @return {String} normalizedModelName
    @for DS
  */

  function normalizeModelName(modelName) {
    return _ember.default.String.dasherize(modelName);
  }
});
define('ember-data/-private/system/ordered-set', ['exports', 'ember'], function (exports, _ember) {
  exports.default = OrderedSet;

  var EmberOrderedSet = _ember.default.OrderedSet;
  var guidFor = _ember.default.guidFor;

  function OrderedSet() {
    this._super$constructor();
  }

  OrderedSet.create = function () {
    var Constructor = this;
    return new Constructor();
  };

  OrderedSet.prototype = Object.create(EmberOrderedSet.prototype);
  OrderedSet.prototype.constructor = OrderedSet;
  OrderedSet.prototype._super$constructor = EmberOrderedSet;

  OrderedSet.prototype.addWithIndex = function (obj, idx) {
    var guid = guidFor(obj);
    var presenceSet = this.presenceSet;
    var list = this.list;

    if (presenceSet[guid] === true) {
      return;
    }

    presenceSet[guid] = true;

    if (idx === undefined || idx === null) {
      list.push(obj);
    } else {
      list.splice(idx, 0, obj);
    }

    this.size += 1;

    return this;
  };
});
define('ember-data/-private/system/promise-proxies', ['exports', 'ember', 'ember-data/-private/debug'], function (exports, _ember, _emberDataPrivateDebug) {

  var Promise = _ember.default.RSVP.Promise;
  var get = _ember.default.get;

  /**
    A `PromiseArray` is an object that acts like both an `Ember.Array`
    and a promise. When the promise is resolved the resulting value
    will be set to the `PromiseArray`'s `content` property. This makes
    it easy to create data bindings with the `PromiseArray` that will be
    updated when the promise resolves.
  
    For more information see the [Ember.PromiseProxyMixin
    documentation](/api/classes/Ember.PromiseProxyMixin.html).
  
    Example
  
    ```javascript
    var promiseArray = DS.PromiseArray.create({
      promise: $.getJSON('/some/remote/data.json')
    });
  
    promiseArray.get('length'); // 0
  
    promiseArray.then(function() {
      promiseArray.get('length'); // 100
    });
    ```
  
    @class PromiseArray
    @namespace DS
    @extends Ember.ArrayProxy
    @uses Ember.PromiseProxyMixin
  */
  var PromiseArray = _ember.default.ArrayProxy.extend(_ember.default.PromiseProxyMixin);

  /**
    A `PromiseObject` is an object that acts like both an `Ember.Object`
    and a promise. When the promise is resolved, then the resulting value
    will be set to the `PromiseObject`'s `content` property. This makes
    it easy to create data bindings with the `PromiseObject` that will
    be updated when the promise resolves.
  
    For more information see the [Ember.PromiseProxyMixin
    documentation](/api/classes/Ember.PromiseProxyMixin.html).
  
    Example
  
    ```javascript
    var promiseObject = DS.PromiseObject.create({
      promise: $.getJSON('/some/remote/data.json')
    });
  
    promiseObject.get('name'); // null
  
    promiseObject.then(function() {
      promiseObject.get('name'); // 'Tomster'
    });
    ```
  
    @class PromiseObject
    @namespace DS
    @extends Ember.ObjectProxy
    @uses Ember.PromiseProxyMixin
  */
  var PromiseObject = _ember.default.ObjectProxy.extend(_ember.default.PromiseProxyMixin);

  var promiseObject = function (promise, label) {
    return PromiseObject.create({
      promise: Promise.resolve(promise, label)
    });
  };

  var promiseArray = function (promise, label) {
    return PromiseArray.create({
      promise: Promise.resolve(promise, label)
    });
  };

  /**
    A PromiseManyArray is a PromiseArray that also proxies certain method calls
    to the underlying manyArray.
    Right now we proxy:
  
      * `reload()`
      * `createRecord()`
      * `on()`
      * `one()`
      * `trigger()`
      * `off()`
      * `has()`
  
    @class PromiseManyArray
    @namespace DS
    @extends Ember.ArrayProxy
  */

  function proxyToContent(method) {
    return function () {
      var content = get(this, 'content');
      return content[method].apply(content, arguments);
    };
  }

  var PromiseManyArray = PromiseArray.extend({
    reload: function () {
      return PromiseManyArray.create({
        promise: get(this, 'content').reload()
      });

      //I don't think this should ever happen right now, but worth guarding if we refactor the async relationships
    },

    createRecord: proxyToContent('createRecord'),

    on: proxyToContent('on'),

    one: proxyToContent('one'),

    trigger: proxyToContent('trigger'),

    off: proxyToContent('off'),

    has: proxyToContent('has')
  });

  var promiseManyArray = function (promise, label) {
    return PromiseManyArray.create({
      promise: Promise.resolve(promise, label)
    });
  };

  exports.PromiseArray = PromiseArray;
  exports.PromiseObject = PromiseObject;
  exports.PromiseManyArray = PromiseManyArray;
  exports.promiseArray = promiseArray;
  exports.promiseObject = promiseObject;
  exports.promiseManyArray = promiseManyArray;
});
define("ember-data/-private/system/record-array-manager", ["exports", "ember", "ember-data/-private/system/record-arrays", "ember-data/-private/system/ordered-set"], function (exports, _ember, _emberDataPrivateSystemRecordArrays, _emberDataPrivateSystemOrderedSet) {
  var MapWithDefault = _ember.default.MapWithDefault;

  var get = _ember.default.get;

  /**
    @class RecordArrayManager
    @namespace DS
    @private
    @extends Ember.Object
  */
  exports.default = _ember.default.Object.extend({
    init: function () {
      var _this = this;

      this.filteredRecordArrays = MapWithDefault.create({
        defaultValue: function () {
          return [];
        }
      });

      this.liveRecordArrays = MapWithDefault.create({
        defaultValue: function (typeClass) {
          return _this.createRecordArray(typeClass);
        }
      });

      this.changedRecords = [];
      this._adapterPopulatedRecordArrays = [];
    },

    recordDidChange: function (record) {
      if (this.changedRecords.push(record) !== 1) {
        return;
      }

      _ember.default.run.schedule('actions', this, this.updateRecordArrays);
    },

    recordArraysForRecord: function (record) {
      record._recordArrays = record._recordArrays || _emberDataPrivateSystemOrderedSet.default.create();
      return record._recordArrays;
    },

    /**
      This method is invoked whenever data is loaded into the store by the
      adapter or updated by the adapter, or when a record has changed.
       It updates all record arrays that a record belongs to.
       To avoid thrashing, it only runs at most once per run loop.
       @method updateRecordArrays
    */
    updateRecordArrays: function () {
      var _this2 = this;

      this.changedRecords.forEach(function (internalModel) {
        if (get(internalModel, 'record.isDestroyed') || get(internalModel, 'record.isDestroying') || get(internalModel, 'currentState.stateName') === 'root.deleted.saved') {
          _this2._recordWasDeleted(internalModel);
        } else {
          _this2._recordWasChanged(internalModel);
        }
      });

      this.changedRecords.length = 0;
    },

    _recordWasDeleted: function (record) {
      var recordArrays = record._recordArrays;

      if (!recordArrays) {
        return;
      }

      recordArrays.forEach(function (array) {
        return array.removeInternalModel(record);
      });

      record._recordArrays = null;
    },

    _recordWasChanged: function (record) {
      var _this3 = this;

      var typeClass = record.type;
      var recordArrays = this.filteredRecordArrays.get(typeClass);
      var filter;
      recordArrays.forEach(function (array) {
        filter = get(array, 'filterFunction');
        _this3.updateFilterRecordArray(array, filter, typeClass, record);
      });
    },

    //Need to update live arrays on loading
    recordWasLoaded: function (record) {
      var _this4 = this;

      var typeClass = record.type;
      var recordArrays = this.filteredRecordArrays.get(typeClass);
      var filter;

      recordArrays.forEach(function (array) {
        filter = get(array, 'filterFunction');
        _this4.updateFilterRecordArray(array, filter, typeClass, record);
      });

      if (this.liveRecordArrays.has(typeClass)) {
        var liveRecordArray = this.liveRecordArrays.get(typeClass);
        this._addRecordToRecordArray(liveRecordArray, record);
      }
    },
    /**
      Update an individual filter.
       @method updateFilterRecordArray
      @param {DS.FilteredRecordArray} array
      @param {Function} filter
      @param {DS.Model} typeClass
      @param {InternalModel} record
    */
    updateFilterRecordArray: function (array, filter, typeClass, record) {
      var shouldBeInArray = filter(record.getRecord());
      var recordArrays = this.recordArraysForRecord(record);
      if (shouldBeInArray) {
        this._addRecordToRecordArray(array, record);
      } else {
        recordArrays.delete(array);
        array.removeInternalModel(record);
      }
    },

    _addRecordToRecordArray: function (array, record) {
      var recordArrays = this.recordArraysForRecord(record);
      if (!recordArrays.has(array)) {
        array.addInternalModel(record);
        recordArrays.add(array);
      }
    },

    populateLiveRecordArray: function (array, modelName) {
      var typeMap = this.store.typeMapFor(modelName);
      var records = typeMap.records;
      var record;

      for (var i = 0; i < records.length; i++) {
        record = records[i];

        if (!record.isDeleted() && !record.isEmpty()) {
          this._addRecordToRecordArray(array, record);
        }
      }
    },

    /**
      This method is invoked if the `filterFunction` property is
      changed on a `DS.FilteredRecordArray`.
       It essentially re-runs the filter from scratch. This same
      method is invoked when the filter is created in th first place.
       @method updateFilter
      @param {Array} array
      @param {String} modelName
      @param {Function} filter
    */
    updateFilter: function (array, modelName, filter) {
      var typeMap = this.store.typeMapFor(modelName);
      var records = typeMap.records;
      var record;

      for (var i = 0; i < records.length; i++) {
        record = records[i];

        if (!record.isDeleted() && !record.isEmpty()) {
          this.updateFilterRecordArray(array, filter, modelName, record);
        }
      }
    },

    /**
      Get the `DS.RecordArray` for a type, which contains all loaded records of
      given type.
       @method liveRecordArrayFor
      @param {Class} typeClass
      @return {DS.RecordArray}
    */
    liveRecordArrayFor: function (typeClass) {
      return this.liveRecordArrays.get(typeClass);
    },

    /**
      Create a `DS.RecordArray` for a type.
       @method createRecordArray
      @param {Class} typeClass
      @return {DS.RecordArray}
    */
    createRecordArray: function (typeClass) {
      var array = _emberDataPrivateSystemRecordArrays.RecordArray.create({
        type: typeClass,
        content: _ember.default.A(),
        store: this.store,
        isLoaded: true,
        manager: this
      });

      return array;
    },

    /**
      Create a `DS.FilteredRecordArray` for a type and register it for updates.
       @method createFilteredRecordArray
      @param {DS.Model} typeClass
      @param {Function} filter
      @param {Object} query (optional
      @return {DS.FilteredRecordArray}
    */
    createFilteredRecordArray: function (typeClass, filter, query) {
      var array = _emberDataPrivateSystemRecordArrays.FilteredRecordArray.create({
        query: query,
        type: typeClass,
        content: _ember.default.A(),
        store: this.store,
        manager: this,
        filterFunction: filter
      });

      this.registerFilteredRecordArray(array, typeClass, filter);

      return array;
    },

    /**
      Create a `DS.AdapterPopulatedRecordArray` for a type with given query.
       @method createAdapterPopulatedRecordArray
      @param {DS.Model} typeClass
      @param {Object} query
      @return {DS.AdapterPopulatedRecordArray}
    */
    createAdapterPopulatedRecordArray: function (typeClass, query) {
      var array = _emberDataPrivateSystemRecordArrays.AdapterPopulatedRecordArray.create({
        type: typeClass,
        query: query,
        content: _ember.default.A(),
        store: this.store,
        manager: this
      });

      this._adapterPopulatedRecordArrays.push(array);

      return array;
    },

    /**
      Register a RecordArray for a given type to be backed by
      a filter function. This will cause the array to update
      automatically when records of that type change attribute
      values or states.
       @method registerFilteredRecordArray
      @param {DS.RecordArray} array
      @param {DS.Model} typeClass
      @param {Function} filter
    */
    registerFilteredRecordArray: function (array, typeClass, filter) {
      var recordArrays = this.filteredRecordArrays.get(typeClass);
      recordArrays.push(array);

      this.updateFilter(array, typeClass, filter);
    },

    /**
      Unregister a RecordArray.
      So manager will not update this array.
       @method unregisterRecordArray
      @param {DS.RecordArray} array
    */
    unregisterRecordArray: function (array) {
      var typeClass = array.type;

      // unregister filtered record array
      var recordArrays = this.filteredRecordArrays.get(typeClass);
      var removedFromFiltered = remove(recordArrays, array);

      // remove from adapter populated record array
      var removedFromAdapterPopulated = remove(this._adapterPopulatedRecordArrays, array);

      if (!removedFromFiltered && !removedFromAdapterPopulated) {

        // unregister live record array
        if (this.liveRecordArrays.has(typeClass)) {
          var liveRecordArrayForType = this.liveRecordArrayFor(typeClass);
          if (array === liveRecordArrayForType) {
            this.liveRecordArrays.delete(typeClass);
          }
        }
      }
    },

    willDestroy: function () {
      this._super.apply(this, arguments);

      this.filteredRecordArrays.forEach(function (value) {
        return flatten(value).forEach(destroy);
      });
      this.liveRecordArrays.forEach(destroy);
      this._adapterPopulatedRecordArrays.forEach(destroy);
    }
  });

  function destroy(entry) {
    entry.destroy();
  }

  function flatten(list) {
    var length = list.length;
    var result = _ember.default.A();

    for (var i = 0; i < length; i++) {
      result = result.concat(list[i]);
    }

    return result;
  }

  function remove(array, item) {
    var index = array.indexOf(item);

    if (index !== -1) {
      array.splice(index, 1);
      return true;
    }

    return false;
  }
});
/**
  @module ember-data
*/
define("ember-data/-private/system/record-arrays", ["exports", "ember-data/-private/system/record-arrays/record-array", "ember-data/-private/system/record-arrays/filtered-record-array", "ember-data/-private/system/record-arrays/adapter-populated-record-array"], function (exports, _emberDataPrivateSystemRecordArraysRecordArray, _emberDataPrivateSystemRecordArraysFilteredRecordArray, _emberDataPrivateSystemRecordArraysAdapterPopulatedRecordArray) {
  exports.RecordArray = _emberDataPrivateSystemRecordArraysRecordArray.default;
  exports.FilteredRecordArray = _emberDataPrivateSystemRecordArraysFilteredRecordArray.default;
  exports.AdapterPopulatedRecordArray = _emberDataPrivateSystemRecordArraysAdapterPopulatedRecordArray.default;
});
/**
  @module ember-data
*/
define("ember-data/-private/system/record-arrays/adapter-populated-record-array", ["exports", "ember", "ember-data/-private/system/record-arrays/record-array", "ember-data/-private/system/clone-null", "ember-data/-private/features"], function (exports, _ember, _emberDataPrivateSystemRecordArraysRecordArray, _emberDataPrivateSystemCloneNull, _emberDataPrivateFeatures) {

  /**
    @module ember-data
  */

  var get = _ember.default.get;

  /**
    Represents an ordered list of records whose order and membership is
    determined by the adapter. For example, a query sent to the adapter
    may trigger a search on the server, whose results would be loaded
    into an instance of the `AdapterPopulatedRecordArray`.
  
    ---
  
    If you want to update the array and get the latest records from the
    adapter, you can invoke [`update()`](#method_update):
  
    Example
  
    ```javascript
    // GET /users?isAdmin=true
    var admins = store.query('user', { isAdmin: true });
  
    admins.then(function() {
      console.log(admins.get("length")); // 42
    });
  
    // somewhere later in the app code, when new admins have been created
    // in the meantime
    //
    // GET /users?isAdmin=true
    admins.update().then(function() {
      admins.get('isUpdating'); // false
      console.log(admins.get("length")); // 123
    });
  
    admins.get('isUpdating'); // true
    ```
  
    @class AdapterPopulatedRecordArray
    @namespace DS
    @extends DS.RecordArray
  */
  exports.default = _emberDataPrivateSystemRecordArraysRecordArray.default.extend({
    query: null,

    replace: function () {
      var type = get(this, 'type').toString();
      throw new Error("The result of a server query (on " + type + ") is immutable.");
    },

    _update: function () {
      var store = get(this, 'store');
      var modelName = get(this, 'type.modelName');
      var query = get(this, 'query');

      return store._query(modelName, query, this);
    },

    /**
      @method loadRecords
      @param {Array} records
      @param {Object} payload normalized payload
      @private
    */
    loadRecords: function (records, payload) {
      var _this = this;

      //TODO Optimize
      var internalModels = _ember.default.A(records).mapBy('_internalModel');
      this.setProperties({
        content: _ember.default.A(internalModels),
        isLoaded: true,
        isUpdating: false,
        meta: (0, _emberDataPrivateSystemCloneNull.default)(payload.meta)
      });

      if (true) {
        this.set('links', (0, _emberDataPrivateSystemCloneNull.default)(payload.links));
      }

      internalModels.forEach(function (record) {
        _this.manager.recordArraysForRecord(record).add(_this);
      });

      // TODO: should triggering didLoad event be the last action of the runLoop?
      _ember.default.run.once(this, 'trigger', 'didLoad');
    }
  });
});
define('ember-data/-private/system/record-arrays/filtered-record-array', ['exports', 'ember', 'ember-data/-private/system/record-arrays/record-array'], function (exports, _ember, _emberDataPrivateSystemRecordArraysRecordArray) {

  /**
    @module ember-data
  */

  var get = _ember.default.get;

  /**
    Represents a list of records whose membership is determined by the
    store. As records are created, loaded, or modified, the store
    evaluates them to determine if they should be part of the record
    array.
  
    @class FilteredRecordArray
    @namespace DS
    @extends DS.RecordArray
  */
  exports.default = _emberDataPrivateSystemRecordArraysRecordArray.default.extend({
    /**
      The filterFunction is a function used to test records from the store to
      determine if they should be part of the record array.
       Example
       ```javascript
      var allPeople = store.peekAll('person');
      allPeople.mapBy('name'); // ["Tom Dale", "Yehuda Katz", "Trek Glowacki"]
       var people = store.filter('person', function(person) {
        if (person.get('name').match(/Katz$/)) { return true; }
      });
      people.mapBy('name'); // ["Yehuda Katz"]
       var notKatzFilter = function(person) {
        return !person.get('name').match(/Katz$/);
      };
      people.set('filterFunction', notKatzFilter);
      people.mapBy('name'); // ["Tom Dale", "Trek Glowacki"]
      ```
       @method filterFunction
      @param {DS.Model} record
      @return {Boolean} `true` if the record should be in the array
    */
    filterFunction: null,
    isLoaded: true,

    replace: function () {
      var type = get(this, 'type').toString();
      throw new Error("The result of a client-side filter (on " + type + ") is immutable.");
    },

    /**
      @method updateFilter
      @private
    */
    _updateFilter: function () {
      var manager = get(this, 'manager');
      manager.updateFilter(this, get(this, 'type'), get(this, 'filterFunction'));
    },

    updateFilter: _ember.default.observer('filterFunction', function () {
      _ember.default.run.once(this, this._updateFilter);
    })
  });
});
define("ember-data/-private/system/record-arrays/record-array", ["exports", "ember", "ember-data/-private/system/promise-proxies", "ember-data/-private/system/snapshot-record-array"], function (exports, _ember, _emberDataPrivateSystemPromiseProxies, _emberDataPrivateSystemSnapshotRecordArray) {

  var get = _ember.default.get;
  var set = _ember.default.set;

  /**
    A record array is an array that contains records of a certain type. The record
    array materializes records as needed when they are retrieved for the first
    time. You should not create record arrays yourself. Instead, an instance of
    `DS.RecordArray` or its subclasses will be returned by your application's store
    in response to queries.
  
    @class RecordArray
    @namespace DS
    @extends Ember.ArrayProxy
    @uses Ember.Evented
  */

  exports.default = _ember.default.ArrayProxy.extend(_ember.default.Evented, {
    /**
      The model type contained by this record array.
       @property type
      @type DS.Model
    */
    type: null,

    /**
      The array of client ids backing the record array. When a
      record is requested from the record array, the record
      for the client id at the same index is materialized, if
      necessary, by the store.
       @property content
      @private
      @type Ember.Array
    */
    content: null,

    /**
      The flag to signal a `RecordArray` is finished loading data.
       Example
       ```javascript
      var people = store.peekAll('person');
      people.get('isLoaded'); // true
      ```
       @property isLoaded
      @type Boolean
    */
    isLoaded: false,
    /**
      The flag to signal a `RecordArray` is currently loading data.
       Example
       ```javascript
      var people = store.peekAll('person');
      people.get('isUpdating'); // false
      people.update();
      people.get('isUpdating'); // true
      ```
       @property isUpdating
      @type Boolean
    */
    isUpdating: false,

    /**
      The store that created this record array.
       @property store
      @private
      @type DS.Store
    */
    store: null,

    replace: function () {
      var type = get(this, 'type').toString();
      throw new Error("The result of a server query (for all " + type + " types) is immutable. To modify contents, use toArray()");
    },

    /**
      Retrieves an object from the content by index.
       @method objectAtContent
      @private
      @param {Number} index
      @return {DS.Model} record
    */
    objectAtContent: function (index) {
      var content = get(this, 'content');
      var internalModel = content.objectAt(index);
      return internalModel && internalModel.getRecord();
    },

    /**
      Used to get the latest version of all of the records in this array
      from the adapter.
       Example
       ```javascript
      var people = store.peekAll('person');
      people.get('isUpdating'); // false
       people.update().then(function() {
        people.get('isUpdating'); // false
      });
       people.get('isUpdating'); // true
      ```
       @method update
    */
    update: function () {
      if (get(this, 'isUpdating')) {
        return;
      }

      this.set('isUpdating', true);
      return this._update();
    },

    /*
      Update this RecordArray and return a promise which resolves once the update
      is finished.
     */
    _update: function () {
      var store = get(this, 'store');
      var modelName = get(this, 'type.modelName');

      return store.findAll(modelName, { reload: true });
    },

    /**
      Adds an internal model to the `RecordArray` without duplicates
       @method addInternalModel
      @private
      @param {InternalModel} internalModel
      @param {number} an optional index to insert at
    */
    addInternalModel: function (internalModel, idx) {
      var content = get(this, 'content');
      if (idx === undefined) {
        content.addObject(internalModel);
      } else if (!content.includes(internalModel)) {
        content.insertAt(idx, internalModel);
      }
    },

    /**
      Removes an internalModel to the `RecordArray`.
       @method removeInternalModel
      @private
      @param {InternalModel} internalModel
    */
    removeInternalModel: function (internalModel) {
      get(this, 'content').removeObject(internalModel);
    },

    /**
      Saves all of the records in the `RecordArray`.
       Example
       ```javascript
      var messages = store.peekAll('message');
      messages.forEach(function(message) {
        message.set('hasBeenSeen', true);
      });
      messages.save();
      ```
       @method save
      @return {DS.PromiseArray} promise
    */
    save: function () {
      var recordArray = this;
      var promiseLabel = "DS: RecordArray#save " + get(this, 'type');
      var promise = _ember.default.RSVP.all(this.invoke("save"), promiseLabel).then(function (array) {
        return recordArray;
      }, null, "DS: RecordArray#save return RecordArray");

      return _emberDataPrivateSystemPromiseProxies.PromiseArray.create({ promise: promise });
    },

    _dissociateFromOwnRecords: function () {
      var _this = this;

      this.get('content').forEach(function (record) {
        var recordArrays = record._recordArrays;

        if (recordArrays) {
          recordArrays.delete(_this);
        }
      });
    },

    /**
      @method _unregisterFromManager
      @private
    */
    _unregisterFromManager: function () {
      var manager = get(this, 'manager');
      manager.unregisterRecordArray(this);
    },

    willDestroy: function () {
      this._unregisterFromManager();
      this._dissociateFromOwnRecords();
      set(this, 'content', undefined);
      set(this, 'length', 0);
      this._super.apply(this, arguments);
    },

    createSnapshot: function (options) {
      var meta = this.get('meta');
      return new _emberDataPrivateSystemSnapshotRecordArray.default(this, meta, options);
    }
  });
});
/**
  @module ember-data
*/
define('ember-data/-private/system/references', ['exports', 'ember-data/-private/system/references/record', 'ember-data/-private/system/references/belongs-to', 'ember-data/-private/system/references/has-many'], function (exports, _emberDataPrivateSystemReferencesRecord, _emberDataPrivateSystemReferencesBelongsTo, _emberDataPrivateSystemReferencesHasMany) {
  exports.RecordReference = _emberDataPrivateSystemReferencesRecord.default;
  exports.BelongsToReference = _emberDataPrivateSystemReferencesBelongsTo.default;
  exports.HasManyReference = _emberDataPrivateSystemReferencesHasMany.default;
});
define('ember-data/-private/system/references/belongs-to', ['exports', 'ember-data/model', 'ember', 'ember-data/-private/system/references/reference', 'ember-data/-private/features', 'ember-data/-private/debug'], function (exports, _emberDataModel, _ember, _emberDataPrivateSystemReferencesReference, _emberDataPrivateFeatures, _emberDataPrivateDebug) {

  var BelongsToReference = function (store, parentInternalModel, belongsToRelationship) {
    this._super$constructor(store, parentInternalModel);
    this.belongsToRelationship = belongsToRelationship;
    this.type = belongsToRelationship.relationshipMeta.type;
    this.parent = parentInternalModel.recordReference;

    // TODO inverse
  };

  BelongsToReference.prototype = Object.create(_emberDataPrivateSystemReferencesReference.default.prototype);
  BelongsToReference.prototype.constructor = BelongsToReference;
  BelongsToReference.prototype._super$constructor = _emberDataPrivateSystemReferencesReference.default;

  BelongsToReference.prototype.remoteType = function () {
    if (this.belongsToRelationship.link) {
      return "link";
    }

    return "id";
  };

  BelongsToReference.prototype.id = function () {
    var inverseRecord = this.belongsToRelationship.inverseRecord;
    return inverseRecord && inverseRecord.id;
  };

  BelongsToReference.prototype.link = function () {
    return this.belongsToRelationship.link;
  };

  BelongsToReference.prototype.meta = function () {
    return this.belongsToRelationship.meta;
  };

  BelongsToReference.prototype.push = function (objectOrPromise) {
    var _this = this;

    return _ember.default.RSVP.resolve(objectOrPromise).then(function (data) {
      var record;

      if (data instanceof _emberDataModel.default) {
        if (false) {}
        record = data;
      } else {
        record = _this.store.push(data);
      }

      _this.belongsToRelationship.setCanonicalRecord(record._internalModel);

      return record;
    });
  };

  BelongsToReference.prototype.value = function () {
    var inverseRecord = this.belongsToRelationship.inverseRecord;

    if (inverseRecord && inverseRecord.record) {
      return inverseRecord.record;
    }

    return null;
  };

  BelongsToReference.prototype.load = function () {
    var _this2 = this;

    if (this.remoteType() === "id") {
      return this.belongsToRelationship.getRecord();
    }

    if (this.remoteType() === "link") {
      return this.belongsToRelationship.findLink().then(function (internalModel) {
        return _this2.value();
      });
    }
  };

  BelongsToReference.prototype.reload = function () {
    var _this3 = this;

    return this.belongsToRelationship.reload().then(function (internalModel) {
      return _this3.value();
    });
  };

  exports.default = BelongsToReference;
});
define('ember-data/-private/system/references/has-many', ['exports', 'ember', 'ember-data/-private/system/references/reference', 'ember-data/-private/debug', 'ember-data/-private/features'], function (exports, _ember, _emberDataPrivateSystemReferencesReference, _emberDataPrivateDebug, _emberDataPrivateFeatures) {

  var get = _ember.default.get;

  var HasManyReference = function (store, parentInternalModel, hasManyRelationship) {
    this._super$constructor(store, parentInternalModel);
    this.hasManyRelationship = hasManyRelationship;
    this.type = hasManyRelationship.relationshipMeta.type;
    this.parent = parentInternalModel.recordReference;

    // TODO inverse
  };

  HasManyReference.prototype = Object.create(_emberDataPrivateSystemReferencesReference.default.prototype);
  HasManyReference.prototype.constructor = HasManyReference;
  HasManyReference.prototype._super$constructor = _emberDataPrivateSystemReferencesReference.default;

  HasManyReference.prototype.remoteType = function () {
    if (this.hasManyRelationship.link) {
      return "link";
    }

    return "ids";
  };

  HasManyReference.prototype.link = function () {
    return this.hasManyRelationship.link;
  };

  HasManyReference.prototype.ids = function () {
    var members = this.hasManyRelationship.members;
    var ids = members.toArray().map(function (internalModel) {
      return internalModel.id;
    });

    return ids;
  };

  HasManyReference.prototype.meta = function () {
    return this.hasManyRelationship.manyArray.meta;
  };

  HasManyReference.prototype.push = function (objectOrPromise) {
    var _this = this;

    return _ember.default.RSVP.resolve(objectOrPromise).then(function (payload) {
      var array = payload;

      if (false) {}

      var useLegacyArrayPush = true;
      if (typeof payload === "object" && payload.data) {
        array = payload.data;
        useLegacyArrayPush = array.length && array[0].data;

        if (false) {}
      }

      if (!false) {
        useLegacyArrayPush = true;
      }

      var internalModels = undefined;
      if (useLegacyArrayPush) {
        internalModels = array.map(function (obj) {
          var record = _this.store.push(obj);

          return record._internalModel;
        });
      } else {
        var records = _this.store.push(payload);
        internalModels = _ember.default.A(records).mapBy('_internalModel');
      }

      _this.hasManyRelationship.computeChanges(internalModels);

      return _this.hasManyRelationship.manyArray;
    });
  };

  HasManyReference.prototype._isLoaded = function () {
    var hasData = get(this.hasManyRelationship, 'hasData');
    if (!hasData) {
      return false;
    }

    var members = this.hasManyRelationship.members.toArray();
    var isEveryLoaded = members.every(function (internalModel) {
      return internalModel.isLoaded() === true;
    });

    return isEveryLoaded;
  };

  HasManyReference.prototype.value = function () {
    if (this._isLoaded()) {
      return this.hasManyRelationship.manyArray;
    }

    return null;
  };

  HasManyReference.prototype.load = function () {
    if (!this._isLoaded()) {
      return this.hasManyRelationship.getRecords();
    }

    var manyArray = this.hasManyRelationship.manyArray;
    return _ember.default.RSVP.resolve(manyArray);
  };

  HasManyReference.prototype.reload = function () {
    return this.hasManyRelationship.reload();
  };

  exports.default = HasManyReference;
});
define('ember-data/-private/system/references/record', ['exports', 'ember', 'ember-data/-private/system/references/reference'], function (exports, _ember, _emberDataPrivateSystemReferencesReference) {

  var RecordReference = function (store, internalModel) {
    this._super$constructor(store, internalModel);
    this.type = internalModel.modelName;
    this._id = internalModel.id;
  };

  RecordReference.prototype = Object.create(_emberDataPrivateSystemReferencesReference.default.prototype);
  RecordReference.prototype.constructor = RecordReference;
  RecordReference.prototype._super$constructor = _emberDataPrivateSystemReferencesReference.default;

  RecordReference.prototype.id = function () {
    return this._id;
  };

  RecordReference.prototype.remoteType = function () {
    return 'identity';
  };

  RecordReference.prototype.push = function (objectOrPromise) {
    var _this = this;

    return _ember.default.RSVP.resolve(objectOrPromise).then(function (data) {
      var record = _this.store.push(data);
      return record;
    });
  };

  RecordReference.prototype.value = function () {
    return this.internalModel.record;
  };

  RecordReference.prototype.load = function () {
    return this.store.findRecord(this.type, this._id);
  };

  RecordReference.prototype.reload = function () {
    var record = this.value();
    if (record) {
      return record.reload();
    }

    return this.load();
  };

  exports.default = RecordReference;
});
define("ember-data/-private/system/references/reference", ["exports"], function (exports) {
  var Reference = function (store, internalModel) {
    this.store = store;
    this.internalModel = internalModel;
  };

  Reference.prototype = {
    constructor: Reference
  };

  exports.default = Reference;
});
define('ember-data/-private/system/relationship-meta', ['exports', 'ember-inflector', 'ember-data/-private/system/normalize-model-name'], function (exports, _emberInflector, _emberDataPrivateSystemNormalizeModelName) {
  exports.typeForRelationshipMeta = typeForRelationshipMeta;
  exports.relationshipFromMeta = relationshipFromMeta;

  function typeForRelationshipMeta(meta) {
    var modelName;

    modelName = meta.type || meta.key;
    if (meta.kind === 'hasMany') {
      modelName = (0, _emberInflector.singularize)((0, _emberDataPrivateSystemNormalizeModelName.default)(modelName));
    }
    return modelName;
  }

  function relationshipFromMeta(meta) {
    return {
      key: meta.key,
      kind: meta.kind,
      type: typeForRelationshipMeta(meta),
      options: meta.options,
      parentType: meta.parentType,
      isRelationship: true
    };
  }
});
define("ember-data/-private/system/relationships/belongs-to", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/normalize-model-name"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemNormalizeModelName) {
  exports.default = belongsTo;

  /**
    `DS.belongsTo` is used to define One-To-One and One-To-Many
    relationships on a [DS.Model](/api/data/classes/DS.Model.html).
  
  
    `DS.belongsTo` takes an optional hash as a second parameter, currently
    supported options are:
  
    - `async`: A boolean value used to explicitly declare this to be an async relationship.
    - `inverse`: A string used to identify the inverse property on a
      related model in a One-To-Many relationship. See [Explicit Inverses](#toc_explicit-inverses)
  
    #### One-To-One
    To declare a one-to-one relationship between two models, use
    `DS.belongsTo`:
  
    ```app/models/user.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      profile: DS.belongsTo('profile')
    });
    ```
  
    ```app/models/profile.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      user: DS.belongsTo('user')
    });
    ```
  
    #### One-To-Many
    To declare a one-to-many relationship between two models, use
    `DS.belongsTo` in combination with `DS.hasMany`, like this:
  
    ```app/models/post.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      comments: DS.hasMany('comment')
    });
    ```
  
    ```app/models/comment.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      post: DS.belongsTo('post')
    });
    ```
  
    You can avoid passing a string as the first parameter. In that case Ember Data
    will infer the type from the key name.
  
    ```app/models/comment.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      post: DS.belongsTo()
    });
    ```
  
    will lookup for a Post type.
  
    @namespace
    @method belongsTo
    @for DS
    @param {String} modelName (optional) type of the relationship
    @param {Object} options (optional) a hash of options
    @return {Ember.computed} relationship
  */

  function belongsTo(modelName, options) {
    var opts, userEnteredModelName;
    if (typeof modelName === 'object') {
      opts = modelName;
      userEnteredModelName = undefined;
    } else {
      opts = options;
      userEnteredModelName = modelName;
    }

    if (typeof userEnteredModelName === 'string') {
      userEnteredModelName = (0, _emberDataPrivateSystemNormalizeModelName.default)(userEnteredModelName);
    }

    opts = opts || {};

    var meta = {
      type: userEnteredModelName,
      isRelationship: true,
      options: opts,
      kind: 'belongsTo',
      key: null
    };

    return _ember.default.computed({
      get: function (key) {
        if (opts.hasOwnProperty('serialize')) {}

        if (opts.hasOwnProperty('embedded')) {}

        return this._internalModel._relationships.get(key).getRecord();
      },
      set: function (key, value) {
        if (value === undefined) {
          value = null;
        }
        if (value && value.then) {
          this._internalModel._relationships.get(key).setRecordPromise(value);
        } else if (value) {
          this._internalModel._relationships.get(key).setRecord(value._internalModel);
        } else {
          this._internalModel._relationships.get(key).setRecord(value);
        }

        return this._internalModel._relationships.get(key).getRecord();
      }
    }).meta(meta);
  }

  /*
    These observers observe all `belongsTo` relationships on the record. See
    `relationships/ext` to see how these observers get their dependencies.
  */
  var BelongsToMixin = _ember.default.Mixin.create({
    notifyBelongsToChanged: function (key) {
      this.notifyPropertyChange(key);
    }
  });
  exports.BelongsToMixin = BelongsToMixin;
});
define("ember-data/-private/system/relationships/ext", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/relationship-meta", "ember-data/-private/system/empty-object"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemRelationshipMeta, _emberDataPrivateSystemEmptyObject) {

  var get = _ember.default.get;
  var Map = _ember.default.Map;
  var MapWithDefault = _ember.default.MapWithDefault;

  var relationshipsDescriptor = _ember.default.computed(function () {
    if (_ember.default.testing === true && relationshipsDescriptor._cacheable === true) {
      relationshipsDescriptor._cacheable = false;
    }

    var map = new MapWithDefault({
      defaultValue: function () {
        return [];
      }
    });

    // Loop through each computed property on the class
    this.eachComputedProperty(function (name, meta) {
      // If the computed property is a relationship, add
      // it to the map.
      if (meta.isRelationship) {
        meta.key = name;
        var relationshipsForType = map.get((0, _emberDataPrivateSystemRelationshipMeta.typeForRelationshipMeta)(meta));

        relationshipsForType.push({
          name: name,
          kind: meta.kind
        });
      }
    });

    return map;
  }).readOnly();

  var relatedTypesDescriptor = _ember.default.computed(function () {
    if (_ember.default.testing === true && relatedTypesDescriptor._cacheable === true) {
      relatedTypesDescriptor._cacheable = false;
    }

    var modelName;
    var types = _ember.default.A();

    // Loop through each computed property on the class,
    // and create an array of the unique types involved
    // in relationships
    this.eachComputedProperty(function (name, meta) {
      if (meta.isRelationship) {
        meta.key = name;
        modelName = (0, _emberDataPrivateSystemRelationshipMeta.typeForRelationshipMeta)(meta);

        if (!types.includes(modelName)) {
          types.push(modelName);
        }
      }
    });

    return types;
  }).readOnly();

  var relationshipsByNameDescriptor = _ember.default.computed(function () {
    if (_ember.default.testing === true && relationshipsByNameDescriptor._cacheable === true) {
      relationshipsByNameDescriptor._cacheable = false;
    }

    var map = Map.create();

    this.eachComputedProperty(function (name, meta) {
      if (meta.isRelationship) {
        meta.key = name;
        var relationship = (0, _emberDataPrivateSystemRelationshipMeta.relationshipFromMeta)(meta);
        relationship.type = (0, _emberDataPrivateSystemRelationshipMeta.typeForRelationshipMeta)(meta);
        map.set(name, relationship);
      }
    });

    return map;
  }).readOnly();

  /**
    @module ember-data
  */

  /*
    This file defines several extensions to the base `DS.Model` class that
    add support for one-to-many relationships.
  */

  /**
    @class Model
    @namespace DS
  */
  var DidDefinePropertyMixin = _ember.default.Mixin.create({

    /**
      This Ember.js hook allows an object to be notified when a property
      is defined.
       In this case, we use it to be notified when an Ember Data user defines a
      belongs-to relationship. In that case, we need to set up observers for
      each one, allowing us to track relationship changes and automatically
      reflect changes in the inverse has-many array.
       This hook passes the class being set up, as well as the key and value
      being defined. So, for example, when the user does this:
       ```javascript
      DS.Model.extend({
        parent: DS.belongsTo('user')
      });
      ```
       This hook would be called with "parent" as the key and the computed
      property returned by `DS.belongsTo` as the value.
       @method didDefineProperty
      @param {Object} proto
      @param {String} key
      @param {Ember.ComputedProperty} value
    */
    didDefineProperty: function (proto, key, value) {
      // Check if the value being set is a computed property.
      if (value instanceof _ember.default.ComputedProperty) {

        // If it is, get the metadata for the relationship. This is
        // populated by the `DS.belongsTo` helper when it is creating
        // the computed property.
        var meta = value.meta();

        meta.parentType = proto.constructor;
      }
    }
  });

  exports.DidDefinePropertyMixin = DidDefinePropertyMixin;
  /*
    These DS.Model extensions add class methods that provide relationship
    introspection abilities about relationships.
  
    A note about the computed properties contained here:
  
    **These properties are effectively sealed once called for the first time.**
    To avoid repeatedly doing expensive iteration over a model's fields, these
    values are computed once and then cached for the remainder of the runtime of
    your application.
  
    If your application needs to modify a class after its initial definition
    (for example, using `reopen()` to add additional attributes), make sure you
    do it before using your model with the store, which uses these properties
    extensively.
  */

  var RelationshipsClassMethodsMixin = _ember.default.Mixin.create({

    /**
      For a given relationship name, returns the model type of the relationship.
       For example, if you define a model like this:
       ```app/models/post.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        comments: DS.hasMany('comment')
      });
     ```
       Calling `App.Post.typeForRelationship('comments')` will return `App.Comment`.
       @method typeForRelationship
      @static
      @param {String} name the name of the relationship
      @param {store} store an instance of DS.Store
      @return {DS.Model} the type of the relationship, or undefined
    */
    typeForRelationship: function (name, store) {
      var relationship = get(this, 'relationshipsByName').get(name);
      return relationship && store.modelFor(relationship.type);
    },

    inverseMap: _ember.default.computed(function () {
      return new _emberDataPrivateSystemEmptyObject.default();
    }),

    /**
      Find the relationship which is the inverse of the one asked for.
       For example, if you define models like this:
       ```app/models/post.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        comments: DS.hasMany('message')
      });
      ```
       ```app/models/message.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        owner: DS.belongsTo('post')
      });
      ```
       App.Post.inverseFor('comments') -> { type: App.Message, name: 'owner', kind: 'belongsTo' }
      App.Message.inverseFor('owner') -> { type: App.Post, name: 'comments', kind: 'hasMany' }
       @method inverseFor
      @static
      @param {String} name the name of the relationship
      @return {Object} the inverse relationship, or null
    */
    inverseFor: function (name, store) {
      var inverseMap = get(this, 'inverseMap');
      if (inverseMap[name]) {
        return inverseMap[name];
      } else {
        var inverse = this._findInverseFor(name, store);
        inverseMap[name] = inverse;
        return inverse;
      }
    },

    //Calculate the inverse, ignoring the cache
    _findInverseFor: function (name, store) {

      var inverseType = this.typeForRelationship(name, store);
      if (!inverseType) {
        return null;
      }

      var propertyMeta = this.metaForProperty(name);
      //If inverse is manually specified to be null, like  `comments: DS.hasMany('message', { inverse: null })`
      var options = propertyMeta.options;
      if (options.inverse === null) {
        return null;
      }

      var inverseName, inverseKind, inverse;

      //If inverse is specified manually, return the inverse
      if (options.inverse) {
        inverseName = options.inverse;
        inverse = _ember.default.get(inverseType, 'relationshipsByName').get(inverseName);

        inverseKind = inverse.kind;
      } else {
        //No inverse was specified manually, we need to use a heuristic to guess one
        if (propertyMeta.type === propertyMeta.parentType.modelName) {}

        var possibleRelationships = findPossibleInverses(this, inverseType);

        if (possibleRelationships.length === 0) {
          return null;
        }

        var filteredRelationships = possibleRelationships.filter(function (possibleRelationship) {
          var optionsForRelationship = inverseType.metaForProperty(possibleRelationship.name).options;
          return name === optionsForRelationship.inverse;
        });

        if (filteredRelationships.length === 1) {
          possibleRelationships = filteredRelationships;
        }

        inverseName = possibleRelationships[0].name;
        inverseKind = possibleRelationships[0].kind;
      }

      function findPossibleInverses(type, inverseType, relationshipsSoFar) {
        var possibleRelationships = relationshipsSoFar || [];

        var relationshipMap = get(inverseType, 'relationships');
        if (!relationshipMap) {
          return possibleRelationships;
        }

        var relationships = relationshipMap.get(type.modelName);

        relationships = relationships.filter(function (relationship) {
          var optionsForRelationship = inverseType.metaForProperty(relationship.name).options;

          if (!optionsForRelationship.inverse) {
            return true;
          }

          return name === optionsForRelationship.inverse;
        });

        if (relationships) {
          possibleRelationships.push.apply(possibleRelationships, relationships);
        }

        //Recurse to support polymorphism
        if (type.superclass) {
          findPossibleInverses(type.superclass, inverseType, possibleRelationships);
        }

        return possibleRelationships;
      }

      return {
        type: inverseType,
        name: inverseName,
        kind: inverseKind
      };
    },

    /**
      The model's relationships as a map, keyed on the type of the
      relationship. The value of each entry is an array containing a descriptor
      for each relationship with that type, describing the name of the relationship
      as well as the type.
       For example, given the following model definition:
       ```app/models/blog.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        users: DS.hasMany('user'),
        owner: DS.belongsTo('user'),
        posts: DS.hasMany('post')
      });
      ```
       This computed property would return a map describing these
      relationships, like this:
       ```javascript
      import Ember from 'ember';
      import Blog from 'app/models/blog';
       var relationships = Ember.get(Blog, 'relationships');
      relationships.get(App.User);
      //=> [ { name: 'users', kind: 'hasMany' },
      //     { name: 'owner', kind: 'belongsTo' } ]
      relationships.get(App.Post);
      //=> [ { name: 'posts', kind: 'hasMany' } ]
      ```
       @property relationships
      @static
      @type Ember.Map
      @readOnly
    */

    relationships: relationshipsDescriptor,

    /**
      A hash containing lists of the model's relationships, grouped
      by the relationship kind. For example, given a model with this
      definition:
       ```app/models/blog.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        users: DS.hasMany('user'),
        owner: DS.belongsTo('user'),
         posts: DS.hasMany('post')
      });
      ```
       This property would contain the following:
       ```javascript
      import Ember from 'ember';
      import Blog from 'app/models/blog';
       var relationshipNames = Ember.get(Blog, 'relationshipNames');
      relationshipNames.hasMany;
      //=> ['users', 'posts']
      relationshipNames.belongsTo;
      //=> ['owner']
      ```
       @property relationshipNames
      @static
      @type Object
      @readOnly
    */
    relationshipNames: _ember.default.computed(function () {
      var names = {
        hasMany: [],
        belongsTo: []
      };

      this.eachComputedProperty(function (name, meta) {
        if (meta.isRelationship) {
          names[meta.kind].push(name);
        }
      });

      return names;
    }),

    /**
      An array of types directly related to a model. Each type will be
      included once, regardless of the number of relationships it has with
      the model.
       For example, given a model with this definition:
       ```app/models/blog.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        users: DS.hasMany('user'),
        owner: DS.belongsTo('user'),
         posts: DS.hasMany('post')
      });
      ```
       This property would contain the following:
       ```javascript
      import Ember from 'ember';
      import Blog from 'app/models/blog';
       var relatedTypes = Ember.get(Blog, 'relatedTypes');
      //=> [ App.User, App.Post ]
      ```
       @property relatedTypes
      @static
      @type Ember.Array
      @readOnly
    */
    relatedTypes: relatedTypesDescriptor,

    /**
      A map whose keys are the relationships of a model and whose values are
      relationship descriptors.
       For example, given a model with this
      definition:
       ```app/models/blog.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        users: DS.hasMany('user'),
        owner: DS.belongsTo('user'),
         posts: DS.hasMany('post')
      });
      ```
       This property would contain the following:
       ```javascript
      import Ember from 'ember';
      import Blog from 'app/models/blog';
       var relationshipsByName = Ember.get(Blog, 'relationshipsByName');
      relationshipsByName.get('users');
      //=> { key: 'users', kind: 'hasMany', type: 'user', options: Object, isRelationship: true }
      relationshipsByName.get('owner');
      //=> { key: 'owner', kind: 'belongsTo', type: 'user', options: Object, isRelationship: true }
      ```
       @property relationshipsByName
      @static
      @type Ember.Map
      @readOnly
    */
    relationshipsByName: relationshipsByNameDescriptor,

    /**
      A map whose keys are the fields of the model and whose values are strings
      describing the kind of the field. A model's fields are the union of all of its
      attributes and relationships.
       For example:
       ```app/models/blog.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        users: DS.hasMany('user'),
        owner: DS.belongsTo('user'),
         posts: DS.hasMany('post'),
         title: DS.attr('string')
      });
      ```
       ```js
      import Ember from 'ember';
      import Blog from 'app/models/blog';
       var fields = Ember.get(Blog, 'fields');
      fields.forEach(function(kind, field) {
        console.log(field, kind);
      });
       // prints:
      // users, hasMany
      // owner, belongsTo
      // posts, hasMany
      // title, attribute
      ```
       @property fields
      @static
      @type Ember.Map
      @readOnly
    */
    fields: _ember.default.computed(function () {
      var map = Map.create();

      this.eachComputedProperty(function (name, meta) {
        if (meta.isRelationship) {
          map.set(name, meta.kind);
        } else if (meta.isAttribute) {
          map.set(name, 'attribute');
        }
      });

      return map;
    }).readOnly(),

    /**
      Given a callback, iterates over each of the relationships in the model,
      invoking the callback with the name of each relationship and its relationship
      descriptor.
       @method eachRelationship
      @static
      @param {Function} callback the callback to invoke
      @param {any} binding the value to which the callback's `this` should be bound
    */
    eachRelationship: function (callback, binding) {
      get(this, 'relationshipsByName').forEach(function (relationship, name) {
        callback.call(binding, name, relationship);
      });
    },

    /**
      Given a callback, iterates over each of the types related to a model,
      invoking the callback with the related type's class. Each type will be
      returned just once, regardless of how many different relationships it has
      with a model.
       @method eachRelatedType
      @static
      @param {Function} callback the callback to invoke
      @param {any} binding the value to which the callback's `this` should be bound
    */
    eachRelatedType: function (callback, binding) {
      var relationshipTypes = get(this, 'relatedTypes');

      for (var i = 0; i < relationshipTypes.length; i++) {
        var type = relationshipTypes[i];
        callback.call(binding, type);
      }
    },

    determineRelationshipType: function (knownSide, store) {
      var knownKey = knownSide.key;
      var knownKind = knownSide.kind;
      var inverse = this.inverseFor(knownKey, store);
      // let key;
      var otherKind = undefined;

      if (!inverse) {
        return knownKind === 'belongsTo' ? 'oneToNone' : 'manyToNone';
      }

      // key = inverse.name;
      otherKind = inverse.kind;

      if (otherKind === 'belongsTo') {
        return knownKind === 'belongsTo' ? 'oneToOne' : 'manyToOne';
      } else {
        return knownKind === 'belongsTo' ? 'oneToMany' : 'manyToMany';
      }
    }

  });

  exports.RelationshipsClassMethodsMixin = RelationshipsClassMethodsMixin;
  var RelationshipsInstanceMethodsMixin = _ember.default.Mixin.create({
    /**
      Given a callback, iterates over each of the relationships in the model,
      invoking the callback with the name of each relationship and its relationship
      descriptor.
        The callback method you provide should have the following signature (all
      parameters are optional):
       ```javascript
      function(name, descriptor);
      ```
       - `name` the name of the current property in the iteration
      - `descriptor` the meta object that describes this relationship
       The relationship descriptor argument is an object with the following properties.
      - **key** <span class="type">String</span> the name of this relationship on the Model
     - **kind** <span class="type">String</span> "hasMany" or "belongsTo"
     - **options** <span class="type">Object</span> the original options hash passed when the relationship was declared
     - **parentType** <span class="type">DS.Model</span> the type of the Model that owns this relationship
     - **type** <span class="type">String</span> the type name of the related Model
       Note that in addition to a callback, you can also pass an optional target
      object that will be set as `this` on the context.
       Example
       ```app/serializers/application.js
      import DS from 'ember-data';
       export default DS.JSONSerializer.extend({
        serialize: function(record, options) {
          var json = {};
           record.eachRelationship(function(name, descriptor) {
            if (descriptor.kind === 'hasMany') {
              var serializedHasManyName = name.toUpperCase() + '_IDS';
              json[serializedHasManyName] = record.get(name).mapBy('id');
            }
          });
           return json;
        }
      });
      ```
       @method eachRelationship
      @param {Function} callback the callback to invoke
      @param {any} binding the value to which the callback's `this` should be bound
    */
    eachRelationship: function (callback, binding) {
      this.constructor.eachRelationship(callback, binding);
    },

    relationshipFor: function (name) {
      return get(this.constructor, 'relationshipsByName').get(name);
    },

    inverseFor: function (key) {
      return this.constructor.inverseFor(key, this.store);
    }

  });
  exports.RelationshipsInstanceMethodsMixin = RelationshipsInstanceMethodsMixin;
});
define("ember-data/-private/system/relationships/has-many", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/normalize-model-name", "ember-data/-private/system/is-array-like"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemNormalizeModelName, _emberDataPrivateSystemIsArrayLike) {
  exports.default = hasMany;

  /**
    `DS.hasMany` is used to define One-To-Many and Many-To-Many
    relationships on a [DS.Model](/api/data/classes/DS.Model.html).
  
    `DS.hasMany` takes an optional hash as a second parameter, currently
    supported options are:
  
    - `async`: A boolean value used to explicitly declare this to be an async relationship.
    - `inverse`: A string used to identify the inverse property on a related model.
  
    #### One-To-Many
    To declare a one-to-many relationship between two models, use
    `DS.belongsTo` in combination with `DS.hasMany`, like this:
  
    ```app/models/post.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      comments: DS.hasMany('comment')
    });
    ```
  
    ```app/models/comment.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      post: DS.belongsTo('post')
    });
    ```
  
    #### Many-To-Many
    To declare a many-to-many relationship between two models, use
    `DS.hasMany`:
  
    ```app/models/post.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      tags: DS.hasMany('tag')
    });
    ```
  
    ```app/models/tag.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      posts: DS.hasMany('post')
    });
    ```
  
    You can avoid passing a string as the first parameter. In that case Ember Data
    will infer the type from the singularized key name.
  
    ```app/models/post.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      tags: DS.hasMany()
    });
    ```
  
    will lookup for a Tag type.
  
    #### Explicit Inverses
  
    Ember Data will do its best to discover which relationships map to
    one another. In the one-to-many code above, for example, Ember Data
    can figure out that changing the `comments` relationship should update
    the `post` relationship on the inverse because post is the only
    relationship to that model.
  
    However, sometimes you may have multiple `belongsTo`/`hasManys` for the
    same type. You can specify which property on the related model is
    the inverse using `DS.hasMany`'s `inverse` option:
  
    ```app/models/comment.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      onePost: DS.belongsTo('post'),
      twoPost: DS.belongsTo('post'),
      redPost: DS.belongsTo('post'),
      bluePost: DS.belongsTo('post')
    });
    ```
  
    ```app/models/post.js
    import DS from 'ember-data';
  
    export default DS.Model.extend({
      comments: DS.hasMany('comment', {
        inverse: 'redPost'
      })
    });
    ```
  
    You can also specify an inverse on a `belongsTo`, which works how
    you'd expect.
  
    @namespace
    @method hasMany
    @for DS
    @param {String} type (optional) type of the relationship
    @param {Object} options (optional) a hash of options
    @return {Ember.computed} relationship
  */

  function hasMany(type, options) {
    if (typeof type === 'object') {
      options = type;
      type = undefined;
    }

    options = options || {};

    if (typeof type === 'string') {
      type = (0, _emberDataPrivateSystemNormalizeModelName.default)(type);
    }

    // Metadata about relationships is stored on the meta of
    // the relationship. This is used for introspection and
    // serialization. Note that `key` is populated lazily
    // the first time the CP is called.
    var meta = {
      type: type,
      isRelationship: true,
      options: options,
      kind: 'hasMany',
      key: null
    };

    return _ember.default.computed({
      get: function (key) {
        var relationship = this._internalModel._relationships.get(key);
        return relationship.getRecords();
      },
      set: function (key, records) {

        var relationship = this._internalModel._relationships.get(key);
        relationship.clear();
        relationship.addRecords(_ember.default.A(records).mapBy('_internalModel'));
        return relationship.getRecords();
      }
    }).meta(meta);
  }

  var HasManyMixin = _ember.default.Mixin.create({
    notifyHasManyAdded: function (key) {
      //We need to notifyPropertyChange in the adding case because we need to make sure
      //we fetch the newly added record in case it is unloaded
      //TODO(Igor): Consider whether we could do this only if the record state is unloaded

      //Goes away once hasMany is double promisified
      this.notifyPropertyChange(key);
    }
  });
  exports.HasManyMixin = HasManyMixin;
});
/**
  @module ember-data
*/
define("ember-data/-private/system/relationships/state/belongs-to", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/promise-proxies", "ember-data/-private/system/relationships/state/relationship"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemPromiseProxies, _emberDataPrivateSystemRelationshipsStateRelationship) {
  exports.default = BelongsToRelationship;

  function BelongsToRelationship(store, record, inverseKey, relationshipMeta) {
    this._super$constructor(store, record, inverseKey, relationshipMeta);
    this.record = record;
    this.key = relationshipMeta.key;
    this.inverseRecord = null;
    this.canonicalState = null;
  }

  BelongsToRelationship.prototype = Object.create(_emberDataPrivateSystemRelationshipsStateRelationship.default.prototype);
  BelongsToRelationship.prototype.constructor = BelongsToRelationship;
  BelongsToRelationship.prototype._super$constructor = _emberDataPrivateSystemRelationshipsStateRelationship.default;

  BelongsToRelationship.prototype.setRecord = function (newRecord) {
    if (newRecord) {
      this.addRecord(newRecord);
    } else if (this.inverseRecord) {
      this.removeRecord(this.inverseRecord);
    }
    this.setHasData(true);
    this.setHasLoaded(true);
  };

  BelongsToRelationship.prototype.setCanonicalRecord = function (newRecord) {
    if (newRecord) {
      this.addCanonicalRecord(newRecord);
    } else if (this.canonicalState) {
      this.removeCanonicalRecord(this.canonicalState);
    }
    this.flushCanonicalLater();
    this.setHasData(true);
    this.setHasLoaded(true);
  };

  BelongsToRelationship.prototype._super$addCanonicalRecord = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.addCanonicalRecord;
  BelongsToRelationship.prototype.addCanonicalRecord = function (newRecord) {
    if (this.canonicalMembers.has(newRecord)) {
      return;
    }

    if (this.canonicalState) {
      this.removeCanonicalRecord(this.canonicalState);
    }

    this.canonicalState = newRecord;
    this._super$addCanonicalRecord(newRecord);
  };

  BelongsToRelationship.prototype._super$flushCanonical = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.flushCanonical;
  BelongsToRelationship.prototype.flushCanonical = function () {
    //temporary fix to not remove newly created records if server returned null.
    //TODO remove once we have proper diffing
    if (this.inverseRecord && this.inverseRecord.isNew() && !this.canonicalState) {
      return;
    }
    this.inverseRecord = this.canonicalState;
    this.record.notifyBelongsToChanged(this.key);
    this._super$flushCanonical();
  };

  BelongsToRelationship.prototype._super$addRecord = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.addRecord;
  BelongsToRelationship.prototype.addRecord = function (newRecord) {
    if (this.members.has(newRecord)) {
      return;
    }

    if (this.inverseRecord) {
      this.removeRecord(this.inverseRecord);
    }

    this.inverseRecord = newRecord;
    this._super$addRecord(newRecord);
    this.record.notifyBelongsToChanged(this.key);
  };

  BelongsToRelationship.prototype.setRecordPromise = function (newPromise) {
    var content = newPromise.get && newPromise.get('content');

    this.setRecord(content ? content._internalModel : content);
  };

  BelongsToRelationship.prototype._super$removeRecordFromOwn = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.removeRecordFromOwn;
  BelongsToRelationship.prototype.removeRecordFromOwn = function (record) {
    if (!this.members.has(record)) {
      return;
    }
    this.inverseRecord = null;
    this._super$removeRecordFromOwn(record);
    this.record.notifyBelongsToChanged(this.key);
  };

  BelongsToRelationship.prototype._super$removeCanonicalRecordFromOwn = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.removeCanonicalRecordFromOwn;
  BelongsToRelationship.prototype.removeCanonicalRecordFromOwn = function (record) {
    if (!this.canonicalMembers.has(record)) {
      return;
    }
    this.canonicalState = null;
    this._super$removeCanonicalRecordFromOwn(record);
  };

  BelongsToRelationship.prototype.findRecord = function () {
    if (this.inverseRecord) {
      return this.store._findByInternalModel(this.inverseRecord);
    } else {
      return _ember.default.RSVP.Promise.resolve(null);
    }
  };

  BelongsToRelationship.prototype.fetchLink = function () {
    var _this = this;

    return this.store.findBelongsTo(this.record, this.link, this.relationshipMeta).then(function (record) {
      if (record) {
        _this.addRecord(record);
      }
      return record;
    });
  };

  BelongsToRelationship.prototype.getRecord = function () {
    var _this2 = this;

    //TODO(Igor) flushCanonical here once our syncing is not stupid
    if (this.isAsync) {
      var promise;
      if (this.link) {
        if (this.hasLoaded) {
          promise = this.findRecord();
        } else {
          promise = this.findLink().then(function () {
            return _this2.findRecord();
          });
        }
      } else {
        promise = this.findRecord();
      }

      return _emberDataPrivateSystemPromiseProxies.PromiseObject.create({
        promise: promise,
        content: this.inverseRecord ? this.inverseRecord.getRecord() : null
      });
    } else {
      if (this.inverseRecord === null) {
        return null;
      }
      var toReturn = this.inverseRecord.getRecord();

      return toReturn;
    }
  };

  BelongsToRelationship.prototype.reload = function () {
    // TODO handle case when reload() is triggered multiple times

    if (this.link) {
      return this.fetchLink();
    }

    // reload record, if it is already loaded
    if (this.inverseRecord && this.inverseRecord.record) {
      return this.inverseRecord.record.reload();
    }

    return this.findRecord();
  };
});
define("ember-data/-private/system/relationships/state/create", ["exports", "ember", "ember-data/-private/system/relationships/state/has-many", "ember-data/-private/system/relationships/state/belongs-to", "ember-data/-private/system/empty-object"], function (exports, _ember, _emberDataPrivateSystemRelationshipsStateHasMany, _emberDataPrivateSystemRelationshipsStateBelongsTo, _emberDataPrivateSystemEmptyObject) {
  exports.default = Relationships;

  var get = _ember.default.get;

  function shouldFindInverse(relationshipMeta) {
    var options = relationshipMeta.options;
    return !(options && options.inverse === null);
  }

  function createRelationshipFor(record, relationshipMeta, store) {
    var inverseKey = undefined;
    var inverse = null;
    if (shouldFindInverse(relationshipMeta)) {
      inverse = record.type.inverseFor(relationshipMeta.key, store);
    }

    if (inverse) {
      inverseKey = inverse.name;
    }

    if (relationshipMeta.kind === 'hasMany') {
      return new _emberDataPrivateSystemRelationshipsStateHasMany.default(store, record, inverseKey, relationshipMeta);
    } else {
      return new _emberDataPrivateSystemRelationshipsStateBelongsTo.default(store, record, inverseKey, relationshipMeta);
    }
  }

  function Relationships(record) {
    this.record = record;
    this.initializedRelationships = new _emberDataPrivateSystemEmptyObject.default();
  }

  Relationships.prototype.has = function (key) {
    return !!this.initializedRelationships[key];
  };

  Relationships.prototype.get = function (key) {
    var relationships = this.initializedRelationships;
    var relationshipsByName = get(this.record.type, 'relationshipsByName');
    if (!relationships[key] && relationshipsByName.get(key)) {
      relationships[key] = createRelationshipFor(this.record, relationshipsByName.get(key), this.record.store);
    }
    return relationships[key];
  };
});
define("ember-data/-private/system/relationships/state/has-many", ["exports", "ember-data/-private/debug", "ember-data/-private/system/promise-proxies", "ember-data/-private/system/relationships/state/relationship", "ember-data/-private/system/ordered-set", "ember-data/-private/system/many-array"], function (exports, _emberDataPrivateDebug, _emberDataPrivateSystemPromiseProxies, _emberDataPrivateSystemRelationshipsStateRelationship, _emberDataPrivateSystemOrderedSet, _emberDataPrivateSystemManyArray) {
  exports.default = ManyRelationship;

  function ManyRelationship(store, record, inverseKey, relationshipMeta) {
    this._super$constructor(store, record, inverseKey, relationshipMeta);
    this.belongsToType = relationshipMeta.type;
    this.canonicalState = [];
    this.manyArray = _emberDataPrivateSystemManyArray.default.create({
      canonicalState: this.canonicalState,
      store: this.store,
      relationship: this,
      type: this.store.modelFor(this.belongsToType),
      record: record
    });
    this.isPolymorphic = relationshipMeta.options.polymorphic;
    this.manyArray.isPolymorphic = this.isPolymorphic;
  }

  ManyRelationship.prototype = Object.create(_emberDataPrivateSystemRelationshipsStateRelationship.default.prototype);
  ManyRelationship.prototype.constructor = ManyRelationship;
  ManyRelationship.prototype._super$constructor = _emberDataPrivateSystemRelationshipsStateRelationship.default;

  ManyRelationship.prototype.destroy = function () {
    this.manyArray.destroy();
  };

  ManyRelationship.prototype._super$updateMeta = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.updateMeta;
  ManyRelationship.prototype.updateMeta = function (meta) {
    this._super$updateMeta(meta);
    this.manyArray.set('meta', meta);
  };

  ManyRelationship.prototype._super$addCanonicalRecord = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.addCanonicalRecord;
  ManyRelationship.prototype.addCanonicalRecord = function (record, idx) {
    if (this.canonicalMembers.has(record)) {
      return;
    }
    if (idx !== undefined) {
      this.canonicalState.splice(idx, 0, record);
    } else {
      this.canonicalState.push(record);
    }
    this._super$addCanonicalRecord(record, idx);
  };

  ManyRelationship.prototype._super$addRecord = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.addRecord;
  ManyRelationship.prototype.addRecord = function (record, idx) {
    if (this.members.has(record)) {
      return;
    }
    this._super$addRecord(record, idx);
    this.manyArray.internalAddRecords([record], idx);
  };

  ManyRelationship.prototype._super$removeCanonicalRecordFromOwn = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.removeCanonicalRecordFromOwn;
  ManyRelationship.prototype.removeCanonicalRecordFromOwn = function (record, idx) {
    var i = idx;
    if (!this.canonicalMembers.has(record)) {
      return;
    }
    if (i === undefined) {
      i = this.canonicalState.indexOf(record);
    }
    if (i > -1) {
      this.canonicalState.splice(i, 1);
    }
    this._super$removeCanonicalRecordFromOwn(record, idx);
  };

  ManyRelationship.prototype._super$flushCanonical = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.flushCanonical;
  ManyRelationship.prototype.flushCanonical = function () {
    this.manyArray.flushCanonical();
    this._super$flushCanonical();
  };

  ManyRelationship.prototype._super$removeRecordFromOwn = _emberDataPrivateSystemRelationshipsStateRelationship.default.prototype.removeRecordFromOwn;
  ManyRelationship.prototype.removeRecordFromOwn = function (record, idx) {
    if (!this.members.has(record)) {
      return;
    }
    this._super$removeRecordFromOwn(record, idx);
    if (idx !== undefined) {
      //TODO(Igor) not used currently, fix
      this.manyArray.currentState.removeAt(idx);
    } else {
      this.manyArray.internalRemoveRecords([record]);
    }
  };

  ManyRelationship.prototype.notifyRecordRelationshipAdded = function (record, idx) {

    this.record.notifyHasManyAdded(this.key, record, idx);
  };

  ManyRelationship.prototype.reload = function () {
    var _this = this;

    var manyArrayLoadedState = this.manyArray.get('isLoaded');

    if (this._loadingPromise) {
      if (this._loadingPromise.get('isPending')) {
        return this._loadingPromise;
      }
      if (this._loadingPromise.get('isRejected')) {
        this.manyArray.set('isLoaded', manyArrayLoadedState);
      }
    }

    if (this.link) {
      this._loadingPromise = (0, _emberDataPrivateSystemPromiseProxies.promiseManyArray)(this.fetchLink(), 'Reload with link');
      return this._loadingPromise;
    } else {
      this._loadingPromise = (0, _emberDataPrivateSystemPromiseProxies.promiseManyArray)(this.store.scheduleFetchMany(this.manyArray.toArray()).then(function () {
        return _this.manyArray;
      }), 'Reload with ids');
      return this._loadingPromise;
    }
  };

  ManyRelationship.prototype.computeChanges = function (records) {
    var members = this.canonicalMembers;
    var recordsToRemove = [];
    var length;
    var record;
    var i;

    records = setForArray(records);

    members.forEach(function (member) {
      if (records.has(member)) {
        return;
      }

      recordsToRemove.push(member);
    });

    this.removeCanonicalRecords(recordsToRemove);

    // Using records.toArray() since currently using
    // removeRecord can modify length, messing stuff up
    // forEach since it directly looks at "length" each
    // iteration
    records = records.toArray();
    length = records.length;
    for (i = 0; i < length; i++) {
      record = records[i];
      this.removeCanonicalRecord(record);
      this.addCanonicalRecord(record, i);
    }
  };

  ManyRelationship.prototype.fetchLink = function () {
    var _this2 = this;

    return this.store.findHasMany(this.record, this.link, this.relationshipMeta).then(function (records) {
      if (records.hasOwnProperty('meta')) {
        _this2.updateMeta(records.meta);
      }
      _this2.store._backburner.join(function () {
        _this2.updateRecordsFromAdapter(records);
        _this2.manyArray.set('isLoaded', true);
      });
      return _this2.manyArray;
    });
  };

  ManyRelationship.prototype.findRecords = function () {
    var _this3 = this;

    var manyArray = this.manyArray.toArray();
    var internalModels = new Array(manyArray.length);

    for (var i = 0; i < manyArray.length; i++) {
      internalModels[i] = manyArray[i]._internalModel;
    }

    //TODO CLEANUP
    return this.store.findMany(internalModels).then(function () {
      if (!_this3.manyArray.get('isDestroyed')) {
        //Goes away after the manyArray refactor
        _this3.manyArray.set('isLoaded', true);
      }
      return _this3.manyArray;
    });
  };
  ManyRelationship.prototype.notifyHasManyChanged = function () {
    this.record.notifyHasManyAdded(this.key);
  };

  ManyRelationship.prototype.getRecords = function () {
    var _this4 = this;

    //TODO(Igor) sync server here, once our syncing is not stupid
    if (this.isAsync) {
      var promise;
      if (this.link) {
        if (this.hasLoaded) {
          promise = this.findRecords();
        } else {
          promise = this.findLink().then(function () {
            return _this4.findRecords();
          });
        }
      } else {
        promise = this.findRecords();
      }
      this._loadingPromise = _emberDataPrivateSystemPromiseProxies.PromiseManyArray.create({
        content: this.manyArray,
        promise: promise
      });
      return this._loadingPromise;
    } else {

      //TODO(Igor) WTF DO I DO HERE?
      if (!this.manyArray.get('isDestroyed')) {
        this.manyArray.set('isLoaded', true);
      }
      return this.manyArray;
    }
  };

  function setForArray(array) {
    var set = new _emberDataPrivateSystemOrderedSet.default();

    if (array) {
      for (var i = 0, l = array.length; i < l; i++) {
        set.add(array[i]);
      }
    }

    return set;
  }
});
define("ember-data/-private/system/relationships/state/relationship", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/ordered-set"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemOrderedSet) {
  exports.default = Relationship;

  function Relationship(store, record, inverseKey, relationshipMeta) {
    var async = relationshipMeta.options.async;
    this.members = new _emberDataPrivateSystemOrderedSet.default();
    this.canonicalMembers = new _emberDataPrivateSystemOrderedSet.default();
    this.store = store;
    this.key = relationshipMeta.key;
    this.inverseKey = inverseKey;
    this.record = record;
    this.isAsync = typeof async === 'undefined' ? true : async;
    this.relationshipMeta = relationshipMeta;
    //This probably breaks for polymorphic relationship in complex scenarios, due to
    //multiple possible modelNames
    this.inverseKeyForImplicit = this.record.constructor.modelName + this.key;
    this.linkPromise = null;
    this.meta = null;
    this.hasData = false;
    this.hasLoaded = false;
  }

  Relationship.prototype = {
    constructor: Relationship,

    destroy: _ember.default.K,

    updateMeta: function (meta) {
      this.meta = meta;
    },

    clear: function () {
      var members = this.members.list;
      var member;

      while (members.length > 0) {
        member = members[0];
        this.removeRecord(member);
      }
    },

    removeRecords: function (records) {
      var _this = this;

      records.forEach(function (record) {
        return _this.removeRecord(record);
      });
    },

    addRecords: function (records, idx) {
      var _this2 = this;

      records.forEach(function (record) {
        _this2.addRecord(record, idx);
        if (idx !== undefined) {
          idx++;
        }
      });
    },

    addCanonicalRecords: function (records, idx) {
      for (var i = 0; i < records.length; i++) {
        if (idx !== undefined) {
          this.addCanonicalRecord(records[i], i + idx);
        } else {
          this.addCanonicalRecord(records[i]);
        }
      }
    },

    addCanonicalRecord: function (record, idx) {
      if (!this.canonicalMembers.has(record)) {
        this.canonicalMembers.add(record);
        if (this.inverseKey) {
          record._relationships.get(this.inverseKey).addCanonicalRecord(this.record);
        } else {
          if (!record._implicitRelationships[this.inverseKeyForImplicit]) {
            record._implicitRelationships[this.inverseKeyForImplicit] = new Relationship(this.store, record, this.key, { options: {} });
          }
          record._implicitRelationships[this.inverseKeyForImplicit].addCanonicalRecord(this.record);
        }
      }
      this.flushCanonicalLater();
      this.setHasData(true);
    },

    removeCanonicalRecords: function (records, idx) {
      for (var i = 0; i < records.length; i++) {
        if (idx !== undefined) {
          this.removeCanonicalRecord(records[i], i + idx);
        } else {
          this.removeCanonicalRecord(records[i]);
        }
      }
    },

    removeCanonicalRecord: function (record, idx) {
      if (this.canonicalMembers.has(record)) {
        this.removeCanonicalRecordFromOwn(record);
        if (this.inverseKey) {
          this.removeCanonicalRecordFromInverse(record);
        } else {
          if (record._implicitRelationships[this.inverseKeyForImplicit]) {
            record._implicitRelationships[this.inverseKeyForImplicit].removeCanonicalRecord(this.record);
          }
        }
      }
      this.flushCanonicalLater();
    },

    addRecord: function (record, idx) {
      if (!this.members.has(record)) {
        this.members.addWithIndex(record, idx);
        this.notifyRecordRelationshipAdded(record, idx);
        if (this.inverseKey) {
          record._relationships.get(this.inverseKey).addRecord(this.record);
        } else {
          if (!record._implicitRelationships[this.inverseKeyForImplicit]) {
            record._implicitRelationships[this.inverseKeyForImplicit] = new Relationship(this.store, record, this.key, { options: {} });
          }
          record._implicitRelationships[this.inverseKeyForImplicit].addRecord(this.record);
        }
        this.record.updateRecordArraysLater();
      }
      this.setHasData(true);
    },

    removeRecord: function (record) {
      if (this.members.has(record)) {
        this.removeRecordFromOwn(record);
        if (this.inverseKey) {
          this.removeRecordFromInverse(record);
        } else {
          if (record._implicitRelationships[this.inverseKeyForImplicit]) {
            record._implicitRelationships[this.inverseKeyForImplicit].removeRecord(this.record);
          }
        }
      }
    },

    removeRecordFromInverse: function (record) {
      var inverseRelationship = record._relationships.get(this.inverseKey);
      //Need to check for existence, as the record might unloading at the moment
      if (inverseRelationship) {
        inverseRelationship.removeRecordFromOwn(this.record);
      }
    },

    removeRecordFromOwn: function (record) {
      this.members.delete(record);
      this.notifyRecordRelationshipRemoved(record);
      this.record.updateRecordArrays();
    },

    removeCanonicalRecordFromInverse: function (record) {
      var inverseRelationship = record._relationships.get(this.inverseKey);
      //Need to check for existence, as the record might unloading at the moment
      if (inverseRelationship) {
        inverseRelationship.removeCanonicalRecordFromOwn(this.record);
      }
    },

    removeCanonicalRecordFromOwn: function (record) {
      this.canonicalMembers.delete(record);
      this.flushCanonicalLater();
    },

    flushCanonical: function () {
      this.willSync = false;
      //a hack for not removing new records
      //TODO remove once we have proper diffing
      var newRecords = [];
      for (var i = 0; i < this.members.list.length; i++) {
        if (this.members.list[i].isNew()) {
          newRecords.push(this.members.list[i]);
        }
      }
      //TODO(Igor) make this less abysmally slow
      this.members = this.canonicalMembers.copy();
      for (i = 0; i < newRecords.length; i++) {
        this.members.add(newRecords[i]);
      }
    },

    flushCanonicalLater: function () {
      var _this3 = this;

      if (this.willSync) {
        return;
      }
      this.willSync = true;
      this.store._backburner.join(function () {
        return _this3.store._backburner.schedule('syncRelationships', _this3, _this3.flushCanonical);
      });
    },

    updateLink: function (link) {
      if (link !== this.link) {
        this.link = link;
        this.linkPromise = null;
        this.setHasLoaded(false);
        this.record.notifyPropertyChange(this.key);
      }
    },

    findLink: function () {
      if (this.linkPromise) {
        return this.linkPromise;
      } else {
        var promise = this.fetchLink();
        this.linkPromise = promise;
        return promise.then(function (result) {
          return result;
        });
      }
    },

    updateRecordsFromAdapter: function (records) {
      //TODO(Igor) move this to a proper place
      //TODO Once we have adapter support, we need to handle updated and canonical changes
      this.computeChanges(records);
      this.setHasData(true);
      this.setHasLoaded(true);
    },

    notifyRecordRelationshipAdded: _ember.default.K,
    notifyRecordRelationshipRemoved: _ember.default.K,

    /*
      `hasData` for a relationship is a flag to indicate if we consider the
      content of this relationship "known". Snapshots uses this to tell the
      difference between unknown (`undefined`) or empty (`null`). The reason for
      this is that we wouldn't want to serialize unknown relationships as `null`
      as that might overwrite remote state.
       All relationships for a newly created (`store.createRecord()`) are
      considered known (`hasData === true`).
     */
    setHasData: function (value) {
      this.hasData = value;
    },

    /*
      `hasLoaded` is a flag to indicate if we have gotten data from the adapter or
      not when the relationship has a link.
       This is used to be able to tell when to fetch the link and when to return
      the local data in scenarios where the local state is considered known
      (`hasData === true`).
       Updating the link will automatically set `hasLoaded` to `false`.
     */
    setHasLoaded: function (value) {
      this.hasLoaded = value;
    }
  };
});
/* global heimdall */
define('ember-data/-private/system/snapshot-record-array', ['exports'], function (exports) {
  exports.default = SnapshotRecordArray;
  /**
    @module ember-data
  */

  /**
    @class SnapshotRecordArray
    @namespace DS
    @private
    @constructor
    @param {Array} snapshots An array of snapshots
    @param {Object} meta
  */

  function SnapshotRecordArray(recordArray, meta) {
    var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

    /**
      An array of snapshots
      @private
      @property _snapshots
      @type {Array}
    */
    this._snapshots = null;
    /**
      An array of records
      @private
      @property _recordArray
      @type {Array}
    */
    this._recordArray = recordArray;
    /**
      Number of records in the array
      @property length
      @type {Number}
    */
    this.length = recordArray.get('length');
    /**
      The type of the underlying records for the snapshots in the array, as a DS.Model
      @property type
      @type {DS.Model}
    */
    this.type = recordArray.get('type');
    /**
      Meta object
      @property meta
      @type {Object}
    */
    this.meta = meta;
    /**
      A hash of adapter options
      @property adapterOptions
      @type {Object}
    */
    this.adapterOptions = options.adapterOptions;

    this.include = options.include;
  }

  /**
    Get snapshots of the underlying record array
    @method snapshots
    @return {Array} Array of snapshots
  */
  SnapshotRecordArray.prototype.snapshots = function () {
    if (this._snapshots) {
      return this._snapshots;
    }
    var recordArray = this._recordArray;
    this._snapshots = recordArray.invoke('createSnapshot');

    return this._snapshots;
  };
});
define("ember-data/-private/system/snapshot", ["exports", "ember", "ember-data/-private/system/empty-object"], function (exports, _ember, _emberDataPrivateSystemEmptyObject) {
  exports.default = Snapshot;

  var get = _ember.default.get;

  /**
    @class Snapshot
    @namespace DS
    @private
    @constructor
    @param {DS.Model} internalModel The model to create a snapshot from
  */

  function Snapshot(internalModel) {
    var _this = this;

    var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    this._attributes = new _emberDataPrivateSystemEmptyObject.default();
    this._belongsToRelationships = new _emberDataPrivateSystemEmptyObject.default();
    this._belongsToIds = new _emberDataPrivateSystemEmptyObject.default();
    this._hasManyRelationships = new _emberDataPrivateSystemEmptyObject.default();
    this._hasManyIds = new _emberDataPrivateSystemEmptyObject.default();

    var record = internalModel.getRecord();
    this.record = record;
    record.eachAttribute(function (keyName) {
      return _this._attributes[keyName] = get(record, keyName);
    });

    this.id = internalModel.id;
    this._internalModel = internalModel;
    this.type = internalModel.type;
    this.modelName = internalModel.type.modelName;

    /**
      A hash of adapter options
      @property adapterOptions
      @type {Object}
    */
    this.adapterOptions = options.adapterOptions;

    this.include = options.include;

    this._changedAttributes = record.changedAttributes();
  }

  Snapshot.prototype = {
    constructor: Snapshot,

    /**
      The id of the snapshot's underlying record
       Example
       ```javascript
      // store.push('post', { id: 1, author: 'Tomster', title: 'Ember.js rocks' });
      postSnapshot.id; // => '1'
      ```
       @property id
      @type {String}
    */
    id: null,

    /**
      The underlying record for this snapshot. Can be used to access methods and
      properties defined on the record.
       Example
       ```javascript
      var json = snapshot.record.toJSON();
      ```
       @property record
      @type {DS.Model}
    */
    record: null,

    /**
      The type of the underlying record for this snapshot, as a DS.Model.
       @property type
      @type {DS.Model}
    */
    type: null,

    /**
      The name of the type of the underlying record for this snapshot, as a string.
       @property modelName
      @type {String}
    */
    modelName: null,

    /**
      Returns the value of an attribute.
       Example
       ```javascript
      // store.push('post', { id: 1, author: 'Tomster', title: 'Ember.js rocks' });
      postSnapshot.attr('author'); // => 'Tomster'
      postSnapshot.attr('title'); // => 'Ember.js rocks'
      ```
       Note: Values are loaded eagerly and cached when the snapshot is created.
       @method attr
      @param {String} keyName
      @return {Object} The attribute value or undefined
    */
    attr: function (keyName) {
      if (keyName in this._attributes) {
        return this._attributes[keyName];
      }
      throw new _ember.default.Error("Model '" + _ember.default.inspect(this.record) + "' has no attribute named '" + keyName + "' defined.");
    },

    /**
      Returns all attributes and their corresponding values.
       Example
       ```javascript
      // store.push('post', { id: 1, author: 'Tomster', title: 'Ember.js rocks' });
      postSnapshot.attributes(); // => { author: 'Tomster', title: 'Ember.js rocks' }
      ```
       @method attributes
      @return {Object} All attributes of the current snapshot
    */
    attributes: function () {
      return _ember.default.copy(this._attributes);
    },

    /**
      Returns all changed attributes and their old and new values.
       Example
       ```javascript
      // store.push('post', { id: 1, author: 'Tomster', title: 'Ember.js rocks' });
      postModel.set('title', 'Ember.js rocks!');
      postSnapshot.changedAttributes(); // => { title: ['Ember.js rocks', 'Ember.js rocks!'] }
      ```
       @method changedAttributes
      @return {Object} All changed attributes of the current snapshot
    */
    changedAttributes: function () {
      var changedAttributes = new _emberDataPrivateSystemEmptyObject.default();
      var changedAttributeKeys = Object.keys(this._changedAttributes);

      for (var i = 0, _length = changedAttributeKeys.length; i < _length; i++) {
        var key = changedAttributeKeys[i];
        changedAttributes[key] = _ember.default.copy(this._changedAttributes[key]);
      }

      return changedAttributes;
    },

    /**
      Returns the current value of a belongsTo relationship.
       `belongsTo` takes an optional hash of options as a second parameter,
      currently supported options are:
      - `id`: set to `true` if you only want the ID of the related record to be
        returned.
       Example
       ```javascript
      // store.push('post', { id: 1, title: 'Hello World' });
      // store.createRecord('comment', { body: 'Lorem ipsum', post: post });
      commentSnapshot.belongsTo('post'); // => DS.Snapshot
      commentSnapshot.belongsTo('post', { id: true }); // => '1'
       // store.push('comment', { id: 1, body: 'Lorem ipsum' });
      commentSnapshot.belongsTo('post'); // => undefined
      ```
       Calling `belongsTo` will return a new Snapshot as long as there's any known
      data for the relationship available, such as an ID. If the relationship is
      known but unset, `belongsTo` will return `null`. If the contents of the
      relationship is unknown `belongsTo` will return `undefined`.
       Note: Relationships are loaded lazily and cached upon first access.
       @method belongsTo
      @param {String} keyName
      @param {Object} [options]
      @return {(DS.Snapshot|String|null|undefined)} A snapshot or ID of a known
        relationship or null if the relationship is known but unset. undefined
        will be returned if the contents of the relationship is unknown.
    */
    belongsTo: function (keyName, options) {
      var id = options && options.id;
      var relationship, inverseRecord, hasData;
      var result;

      if (id && keyName in this._belongsToIds) {
        return this._belongsToIds[keyName];
      }

      if (!id && keyName in this._belongsToRelationships) {
        return this._belongsToRelationships[keyName];
      }

      relationship = this._internalModel._relationships.get(keyName);
      if (!(relationship && relationship.relationshipMeta.kind === 'belongsTo')) {
        throw new _ember.default.Error("Model '" + _ember.default.inspect(this.record) + "' has no belongsTo relationship named '" + keyName + "' defined.");
      }

      hasData = get(relationship, 'hasData');
      inverseRecord = get(relationship, 'inverseRecord');

      if (hasData) {
        if (inverseRecord && !inverseRecord.isDeleted()) {
          if (id) {
            result = get(inverseRecord, 'id');
          } else {
            result = inverseRecord.createSnapshot();
          }
        } else {
          result = null;
        }
      }

      if (id) {
        this._belongsToIds[keyName] = result;
      } else {
        this._belongsToRelationships[keyName] = result;
      }

      return result;
    },

    /**
      Returns the current value of a hasMany relationship.
       `hasMany` takes an optional hash of options as a second parameter,
      currently supported options are:
      - `ids`: set to `true` if you only want the IDs of the related records to be
        returned.
       Example
       ```javascript
      // store.push('post', { id: 1, title: 'Hello World', comments: [2, 3] });
      postSnapshot.hasMany('comments'); // => [DS.Snapshot, DS.Snapshot]
      postSnapshot.hasMany('comments', { ids: true }); // => ['2', '3']
       // store.push('post', { id: 1, title: 'Hello World' });
      postSnapshot.hasMany('comments'); // => undefined
      ```
       Note: Relationships are loaded lazily and cached upon first access.
       @method hasMany
      @param {String} keyName
      @param {Object} [options]
      @return {(Array|undefined)} An array of snapshots or IDs of a known
        relationship or an empty array if the relationship is known but unset.
        undefined will be returned if the contents of the relationship is unknown.
    */
    hasMany: function (keyName, options) {
      var ids = options && options.ids;
      var relationship, members, hasData;
      var results;

      if (ids && keyName in this._hasManyIds) {
        return this._hasManyIds[keyName];
      }

      if (!ids && keyName in this._hasManyRelationships) {
        return this._hasManyRelationships[keyName];
      }

      relationship = this._internalModel._relationships.get(keyName);
      if (!(relationship && relationship.relationshipMeta.kind === 'hasMany')) {
        throw new _ember.default.Error("Model '" + _ember.default.inspect(this.record) + "' has no hasMany relationship named '" + keyName + "' defined.");
      }

      hasData = get(relationship, 'hasData');
      members = get(relationship, 'members');

      if (hasData) {
        results = [];
        members.forEach(function (member) {
          if (!member.isDeleted()) {
            if (ids) {
              results.push(member.id);
            } else {
              results.push(member.createSnapshot());
            }
          }
        });
      }

      if (ids) {
        this._hasManyIds[keyName] = results;
      } else {
        this._hasManyRelationships[keyName] = results;
      }

      return results;
    },

    /**
      Iterates through all the attributes of the model, calling the passed
      function on each attribute.
       Example
       ```javascript
      snapshot.eachAttribute(function(name, meta) {
        // ...
      });
      ```
       @method eachAttribute
      @param {Function} callback the callback to execute
      @param {Object} [binding] the value to which the callback's `this` should be bound
    */
    eachAttribute: function (callback, binding) {
      this.record.eachAttribute(callback, binding);
    },

    /**
      Iterates through all the relationships of the model, calling the passed
      function on each relationship.
       Example
       ```javascript
      snapshot.eachRelationship(function(name, relationship) {
        // ...
      });
      ```
       @method eachRelationship
      @param {Function} callback the callback to execute
      @param {Object} [binding] the value to which the callback's `this` should be bound
    */
    eachRelationship: function (callback, binding) {
      this.record.eachRelationship(callback, binding);
    },

    /**
      @method serialize
      @param {Object} options
      @return {Object} an object whose values are primitive JSON values only
     */
    serialize: function (options) {
      return this.record.store.serializerFor(this.modelName).serialize(this, options);
    }
  };
});
/**
  @module ember-data
*/
define('ember-data/-private/system/store', ['exports', 'ember', 'ember-data/model', 'ember-data/-private/debug', 'ember-data/-private/system/normalize-link', 'ember-data/-private/system/normalize-model-name', 'ember-data/adapters/errors', 'ember-data/-private/system/promise-proxies', 'ember-data/-private/system/store/common', 'ember-data/-private/system/store/serializer-response', 'ember-data/-private/system/store/serializers', 'ember-data/-private/system/store/finders', 'ember-data/-private/utils', 'ember-data/-private/system/coerce-id', 'ember-data/-private/system/record-array-manager', 'ember-data/-private/system/store/container-instance-cache', 'ember-data/-private/system/model/internal-model', 'ember-data/-private/system/empty-object', 'ember-data/-private/features'], function (exports, _ember, _emberDataModel, _emberDataPrivateDebug, _emberDataPrivateSystemNormalizeLink, _emberDataPrivateSystemNormalizeModelName, _emberDataAdaptersErrors, _emberDataPrivateSystemPromiseProxies, _emberDataPrivateSystemStoreCommon, _emberDataPrivateSystemStoreSerializerResponse, _emberDataPrivateSystemStoreSerializers, _emberDataPrivateSystemStoreFinders, _emberDataPrivateUtils, _emberDataPrivateSystemCoerceId, _emberDataPrivateSystemRecordArrayManager, _emberDataPrivateSystemStoreContainerInstanceCache, _emberDataPrivateSystemModelInternalModel, _emberDataPrivateSystemEmptyObject, _emberDataPrivateFeatures) {
  var badIdFormatAssertion = '`id` passed to `findRecord()` has to be non-empty string or number';

  exports.badIdFormatAssertion = badIdFormatAssertion;
  var Backburner = _ember.default._Backburner;
  var Map = _ember.default.Map;

  //Get the materialized model from the internalModel/promise that returns
  //an internal model and return it in a promiseObject. Useful for returning
  //from find methods
  function promiseRecord(internalModel, label) {
    var toReturn = internalModel.then(function (model) {
      return model.getRecord();
    });
    return (0, _emberDataPrivateSystemPromiseProxies.promiseObject)(toReturn, label);
  }

  var once = _ember.default.run.once;
  var Promise = _ember.default.RSVP.Promise;
  var Store;

  var copy = _ember.default.copy;
  var get = _ember.default.get;
  var GUID_KEY = _ember.default.GUID_KEY;
  var isNone = _ember.default.isNone;
  var isPresent = _ember.default.isPresent;
  var set = _ember.default.set;
  var Service = _ember.default.Service;

  // Implementors Note:
  //
  //   The variables in this file are consistently named according to the following
  //   scheme:
  //
  //   * +id+ means an identifier managed by an external source, provided inside
  //     the data provided by that source. These are always coerced to be strings
  //     before being used internally.
  //   * +clientId+ means a transient numerical identifier generated at runtime by
  //     the data store. It is important primarily because newly created objects may
  //     not yet have an externally generated id.
  //   * +internalModel+ means a record internalModel object, which holds metadata about a
  //     record, even if it has not yet been fully materialized.
  //   * +type+ means a DS.Model.

  /**
    The store contains all of the data for records loaded from the server.
    It is also responsible for creating instances of `DS.Model` that wrap
    the individual data for a record, so that they can be bound to in your
    Handlebars templates.
  
    Define your application's store like this:
  
    ```app/services/store.js
    import DS from 'ember-data';
  
    export default DS.Store.extend({
    });
    ```
  
    Most Ember.js applications will only have a single `DS.Store` that is
    automatically created by their `Ember.Application`.
  
    You can retrieve models from the store in several ways. To retrieve a record
    for a specific id, use `DS.Store`'s `findRecord()` method:
  
    ```javascript
    store.findRecord('person', 123).then(function (person) {
    });
    ```
  
    By default, the store will talk to your backend using a standard
    REST mechanism. You can customize how the store talks to your
    backend by specifying a custom adapter:
  
    ```app/adapters/application.js
    import DS from 'ember-data';
  
    export default DS.Adapter.extend({
    });
    ```
  
    You can learn more about writing a custom adapter by reading the `DS.Adapter`
    documentation.
  
    ### Store createRecord() vs. push() vs. pushPayload()
  
    The store provides multiple ways to create new record objects. They have
    some subtle differences in their use which are detailed below:
  
    [createRecord](#method_createRecord) is used for creating new
    records on the client side. This will return a new record in the
    `created.uncommitted` state. In order to persist this record to the
    backend you will need to call `record.save()`.
  
    [push](#method_push) is used to notify Ember Data's store of new or
    updated records that exist in the backend. This will return a record
    in the `loaded.saved` state. The primary use-case for `store#push` is
    to notify Ember Data about record updates (full or partial) that happen
    outside of the normal adapter methods (for example
    [SSE](http://dev.w3.org/html5/eventsource/) or [Web
    Sockets](http://www.w3.org/TR/2009/WD-websockets-20091222/)).
  
    [pushPayload](#method_pushPayload) is a convenience wrapper for
    `store#push` that will deserialize payloads if the
    Serializer implements a `pushPayload` method.
  
    Note: When creating a new record using any of the above methods
    Ember Data will update `DS.RecordArray`s such as those returned by
    `store#peekAll()`, `store#findAll()` or `store#filter()`. This means any
    data bindings or computed properties that depend on the RecordArray
    will automatically be synced to include the new or updated record
    values.
  
    @class Store
    @namespace DS
    @extends Ember.Service
  */
  exports.Store = Store = Service.extend({

    /**
      @method init
      @private
    */
    init: function () {
      this._super.apply(this, arguments);
      this._backburner = new Backburner(['normalizeRelationships', 'syncRelationships', 'finished']);
      // internal bookkeeping; not observable
      this.typeMaps = {};
      this.recordArrayManager = _emberDataPrivateSystemRecordArrayManager.default.create({
        store: this
      });
      this._pendingSave = [];
      this._instanceCache = new _emberDataPrivateSystemStoreContainerInstanceCache.default((0, _emberDataPrivateUtils.getOwner)(this));
      //Used to keep track of all the find requests that need to be coalesced
      this._pendingFetch = Map.create();
    },

    /**
      The adapter to use to communicate to a backend server or other persistence layer.
       This can be specified as an instance, class, or string.
       If you want to specify `app/adapters/custom.js` as a string, do:
       ```js
      adapter: 'custom'
      ```
       @property adapter
      @default DS.JSONAPIAdapter
      @type {(DS.Adapter|String)}
    */
    adapter: '-json-api',

    /**
      Returns a JSON representation of the record using a custom
      type-specific serializer, if one exists.
       The available options are:
       * `includeId`: `true` if the record's ID should be included in
        the JSON representation
       @method serialize
      @private
      @param {DS.Model} record the record to serialize
      @param {Object} options an options hash
    */
    serialize: function (record, options) {
      var snapshot = record._internalModel.createSnapshot();
      return snapshot.serialize(options);
    },

    /**
      This property returns the adapter, after resolving a possible
      string key.
       If the supplied `adapter` was a class, or a String property
      path resolved to a class, this property will instantiate the
      class.
       This property is cacheable, so the same instance of a specified
      adapter class should be used for the lifetime of the store.
       @property defaultAdapter
      @private
      @return DS.Adapter
    */
    defaultAdapter: _ember.default.computed('adapter', function () {
      var adapter = get(this, 'adapter');

      adapter = this.retrieveManagedInstance('adapter', adapter);

      return adapter;
    }),

    // .....................
    // . CREATE NEW RECORD .
    // .....................

    /**
      Create a new record in the current store. The properties passed
      to this method are set on the newly created record.
       To create a new instance of a `Post`:
       ```js
      store.createRecord('post', {
        title: "Rails is omakase"
      });
      ```
       To create a new instance of a `Post` that has a relationship with a `User` record:
       ```js
      var user = this.store.peekRecord('user', 1);
      store.createRecord('post', {
        title: "Rails is omakase",
        user: user
      });
      ```
       @method createRecord
      @param {String} modelName
      @param {Object} inputProperties a hash of properties to set on the
        newly created record.
      @return {DS.Model} record
    */
    createRecord: function (modelName, inputProperties) {
      var typeClass = this.modelFor(modelName);
      var properties = copy(inputProperties) || new _emberDataPrivateSystemEmptyObject.default();

      // If the passed properties do not include a primary key,
      // give the adapter an opportunity to generate one. Typically,
      // client-side ID generators will use something like uuid.js
      // to avoid conflicts.

      if (isNone(properties.id)) {
        properties.id = this._generateId(modelName, properties);
      }

      // Coerce ID to a string
      properties.id = (0, _emberDataPrivateSystemCoerceId.default)(properties.id);

      var internalModel = this.buildInternalModel(typeClass, properties.id);
      var record = internalModel.getRecord();

      // Move the record out of its initial `empty` state into
      // the `loaded` state.
      internalModel.loadedData();

      // Set the properties specified on the record.
      record.setProperties(properties);

      internalModel.eachRelationship(function (key, descriptor) {
        internalModel._relationships.get(key).setHasData(true);
      });

      return record;
    },

    /**
      If possible, this method asks the adapter to generate an ID for
      a newly created record.
       @method _generateId
      @private
      @param {String} modelName
      @param {Object} properties from the new record
      @return {String} if the adapter can generate one, an ID
    */
    _generateId: function (modelName, properties) {
      var adapter = this.adapterFor(modelName);

      if (adapter && adapter.generateIdForRecord) {
        return adapter.generateIdForRecord(this, modelName, properties);
      }

      return null;
    },

    // .................
    // . DELETE RECORD .
    // .................

    /**
      For symmetry, a record can be deleted via the store.
       Example
       ```javascript
      var post = store.createRecord('post', {
        title: "Rails is omakase"
      });
       store.deleteRecord(post);
      ```
       @method deleteRecord
      @param {DS.Model} record
    */
    deleteRecord: function (record) {
      record.deleteRecord();
    },

    /**
      For symmetry, a record can be unloaded via the store. Only
      non-dirty records can be unloaded.
       Example
       ```javascript
      store.findRecord('post', 1).then(function(post) {
        store.unloadRecord(post);
      });
      ```
       @method unloadRecord
      @param {DS.Model} record
    */
    unloadRecord: function (record) {
      record.unloadRecord();
    },

    // ................
    // . FIND RECORDS .
    // ................

    /**
      @method find
      @param {String} modelName
      @param {String|Integer} id
      @param {Object} options
      @return {Promise} promise
      @private
    */
    find: function (modelName, id, options) {
      // The default `model` hook in Ember.Route calls `find(modelName, id)`,
      // that's why we have to keep this method around even though `findRecord` is
      // the public way to get a record by modelName and id.

      if (arguments.length === 1) {}

      if (_ember.default.typeOf(id) === 'object') {}

      if (options) {}

      return this.findRecord(modelName, id);
    },

    /**
      This method returns a record for a given type and id combination.
       The `findRecord` method will always resolve its promise with the same
      object for a given type and `id`.
       The `findRecord` method will always return a **promise** that will be
      resolved with the record.
       Example
       ```app/routes/post.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        model: function(params) {
          return this.store.findRecord('post', params.post_id);
        }
      });
      ```
       If the record is not yet available, the store will ask the adapter's `find`
      method to find the necessary data. If the record is already present in the
      store, it depends on the reload behavior _when_ the returned promise
      resolves.
       ### Reloading
       The reload behavior is configured either via the passed `options` hash or
      the result of the adapter's `shouldReloadRecord`.
       If `{ reload: true }` is passed or `adapter.shouldReloadRecord` evaluates
      to `true`, then the returned promise resolves once the adapter returns
      data, regardless if the requested record is already in the store:
       ```js
      store.push({
        data: {
          id: 1,
          type: 'post',
          revision: 1
        }
      });
       // adapter#findRecord resolves with
      // [
      //   {
      //     id: 1,
      //     type: 'post',
      //     revision: 2
      //   }
      // ]
      store.findRecord('post', 1, { reload: true }).then(function(post) {
        post.get("revision"); // 2
      });
      ```
       If no reload is indicated via the abovementioned ways, then the promise
      immediately resolves with the cached version in the store.
       ### Background Reloading
       Optionally, if `adapter.shouldBackgroundReloadRecord` evaluates to `true`,
      then a background reload is started, which updates the records' data, once
      it is available:
       ```js
      // app/adapters/post.js
      import ApplicationAdapter from "./application";
       export default ApplicationAdapter.extend({
        shouldReloadRecord(store, snapshot) {
          return false;
        },
         shouldBackgroundReloadRecord(store, snapshot) {
          return true;
        }
      });
       // ...
       store.push({
        data: {
          id: 1,
          type: 'post',
          revision: 1
        }
      });
       var blogPost = store.findRecord('post', 1).then(function(post) {
        post.get('revision'); // 1
      });
       // later, once adapter#findRecord resolved with
      // [
      //   {
      //     id: 1,
      //     type: 'post',
      //     revision: 2
      //   }
      // ]
       blogPost.get('revision'); // 2
      ```
       If you would like to force or prevent background reloading, you can set a
      boolean value for `backgroundReload` in the options object for
      `findRecord`.
       ```app/routes/post/edit.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        model: function(params) {
          return this.store.findRecord('post', params.post_id, { backgroundReload: false });
        }
      });
      ```
      If you pass an object on the `adapterOptions` property of the options
     argument it will be passed to you adapter via the snapshot
       ```app/routes/post/edit.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        model: function(params) {
          return this.store.findRecord('post', params.post_id, {
            adapterOptions: { subscribe: false }
          });
        }
      });
      ```
       ```app/adapters/post.js
      import MyCustomAdapter from './custom-adapter';
       export default MyCustomAdapter.extend({
        findRecord: function(store, type, id, snapshot) {
          if (snapshot.adapterOptions.subscribe) {
            // ...
          }
          // ...
        }
      });
      ```
       See [peekRecord](#method_peekRecord) to get the cached version of a record.
       @since 1.13.0
      @method findRecord
      @param {String} modelName
      @param {(String|Integer)} id
      @param {Object} options
      @return {Promise} promise
    */
    findRecord: function (modelName, id, options) {

      var internalModel = this._internalModelForId(modelName, id);
      options = options || {};

      if (!this.hasRecordForId(modelName, id)) {
        return this._findByInternalModel(internalModel, options);
      }

      var fetchedInternalModel = this._findRecord(internalModel, options);

      return promiseRecord(fetchedInternalModel, "DS: Store#findRecord " + internalModel.typeKey + " with id: " + get(internalModel, 'id'));
    },

    _findRecord: function (internalModel, options) {
      // Refetch if the reload option is passed
      if (options.reload) {
        return this.scheduleFetch(internalModel, options);
      }

      var snapshot = internalModel.createSnapshot(options);
      var typeClass = internalModel.type;
      var adapter = this.adapterFor(typeClass.modelName);

      // Refetch the record if the adapter thinks the record is stale
      if (adapter.shouldReloadRecord(this, snapshot)) {
        return this.scheduleFetch(internalModel, options);
      }

      if (options.backgroundReload === false) {
        return Promise.resolve(internalModel);
      }

      // Trigger the background refetch if backgroundReload option is passed
      if (options.backgroundReload || adapter.shouldBackgroundReloadRecord(this, snapshot)) {
        this.scheduleFetch(internalModel, options);
      }

      // Return the cached record
      return Promise.resolve(internalModel);
    },

    _findByInternalModel: function (internalModel, options) {
      options = options || {};

      if (options.preload) {
        internalModel._preloadData(options.preload);
      }

      var fetchedInternalModel = this._findEmptyInternalModel(internalModel, options);

      return promiseRecord(fetchedInternalModel, "DS: Store#findRecord " + internalModel.typeKey + " with id: " + get(internalModel, 'id'));
    },

    _findEmptyInternalModel: function (internalModel, options) {
      if (internalModel.isEmpty()) {
        return this.scheduleFetch(internalModel, options);
      }

      //TODO double check about reloading
      if (internalModel.isLoading()) {
        return internalModel._loadingPromise;
      }

      return Promise.resolve(internalModel);
    },

    /**
      This method makes a series of requests to the adapter's `find` method
      and returns a promise that resolves once they are all loaded.
       @private
      @method findByIds
      @param {String} modelName
      @param {Array} ids
      @return {Promise} promise
    */
    findByIds: function (modelName, ids) {
      var promises = new Array(ids.length);

      for (var i = 0; i < ids.length; i++) {
        promises[i] = this.findRecord(modelName, ids[i]);
      }

      return (0, _emberDataPrivateSystemPromiseProxies.promiseArray)(_ember.default.RSVP.all(promises).then(_ember.default.A, null, "DS: Store#findByIds of " + modelName + " complete"));
    },

    /**
      This method is called by `findRecord` if it discovers that a particular
      type/id pair hasn't been loaded yet to kick off a request to the
      adapter.
       @method fetchRecord
      @private
      @param {InternalModel} internalModel model
      @return {Promise} promise
     */
    // TODO rename this to have an underscore
    fetchRecord: function (internalModel, options) {
      var typeClass = internalModel.type;
      var id = internalModel.id;
      var adapter = this.adapterFor(typeClass.modelName);

      var promise = (0, _emberDataPrivateSystemStoreFinders._find)(adapter, this, typeClass, id, internalModel, options);
      return promise;
    },

    scheduleFetchMany: function (records) {
      var internalModels = new Array(records.length);
      var fetches = new Array(records.length);
      for (var i = 0; i < records.length; i++) {
        internalModels[i] = records[i]._internalModel;
      }

      for (var i = 0; i < internalModels.length; i++) {
        fetches[i] = this.scheduleFetch(internalModels[i]);
      }

      return _ember.default.RSVP.Promise.all(fetches);
    },

    scheduleFetch: function (internalModel, options) {
      var typeClass = internalModel.type;

      if (internalModel._loadingPromise) {
        return internalModel._loadingPromise;
      }

      var resolver = _ember.default.RSVP.defer('Fetching ' + typeClass + 'with id: ' + internalModel.id);
      var pendingFetchItem = {
        record: internalModel,
        resolver: resolver,
        options: options
      };
      var promise = resolver.promise;

      internalModel.loadingData(promise);

      if (!this._pendingFetch.get(typeClass)) {
        this._pendingFetch.set(typeClass, [pendingFetchItem]);
      } else {
        this._pendingFetch.get(typeClass).push(pendingFetchItem);
      }
      _ember.default.run.scheduleOnce('afterRender', this, this.flushAllPendingFetches);

      return promise;
    },

    flushAllPendingFetches: function () {
      if (this.isDestroyed || this.isDestroying) {
        return;
      }

      this._pendingFetch.forEach(this._flushPendingFetchForType, this);
      this._pendingFetch = Map.create();
    },

    _flushPendingFetchForType: function (pendingFetchItems, typeClass) {
      var store = this;
      var adapter = store.adapterFor(typeClass.modelName);
      var shouldCoalesce = !!adapter.findMany && adapter.coalesceFindRequests;
      var records = _ember.default.A(pendingFetchItems).mapBy('record');

      function _fetchRecord(recordResolverPair) {
        recordResolverPair.resolver.resolve(store.fetchRecord(recordResolverPair.record, recordResolverPair.options)); // TODO adapter options
      }

      function resolveFoundRecords(records) {
        records.forEach(function (record) {
          var pair = _ember.default.A(pendingFetchItems).findBy('record', record);
          if (pair) {
            var resolver = pair.resolver;
            resolver.resolve(record);
          }
        });
        return records;
      }

      function makeMissingRecordsRejector(requestedRecords) {
        return function rejectMissingRecords(resolvedRecords) {
          resolvedRecords = _ember.default.A(resolvedRecords);
          var missingRecords = requestedRecords.reject(function (record) {
            return resolvedRecords.includes(record);
          });
          if (missingRecords.length) {}
          rejectRecords(missingRecords);
        };
      }

      function makeRecordsRejector(records) {
        return function (error) {
          rejectRecords(records, error);
        };
      }

      function rejectRecords(records, error) {
        records.forEach(function (record) {
          var pair = _ember.default.A(pendingFetchItems).findBy('record', record);
          if (pair) {
            var resolver = pair.resolver;
            resolver.reject(error);
          }
        });
      }

      if (pendingFetchItems.length === 1) {
        _fetchRecord(pendingFetchItems[0]);
      } else if (shouldCoalesce) {

        // TODO: Improve records => snapshots => records => snapshots
        //
        // We want to provide records to all store methods and snapshots to all
        // adapter methods. To make sure we're doing that we're providing an array
        // of snapshots to adapter.groupRecordsForFindMany(), which in turn will
        // return grouped snapshots instead of grouped records.
        //
        // But since the _findMany() finder is a store method we need to get the
        // records from the grouped snapshots even though the _findMany() finder
        // will once again convert the records to snapshots for adapter.findMany()

        var snapshots = _ember.default.A(records).invoke('createSnapshot');
        var groups = adapter.groupRecordsForFindMany(this, snapshots);
        groups.forEach(function (groupOfSnapshots) {
          var groupOfRecords = _ember.default.A(groupOfSnapshots).mapBy('_internalModel');
          var requestedRecords = _ember.default.A(groupOfRecords);
          var ids = requestedRecords.mapBy('id');
          if (ids.length > 1) {
            (0, _emberDataPrivateSystemStoreFinders._findMany)(adapter, store, typeClass, ids, requestedRecords).then(resolveFoundRecords).then(makeMissingRecordsRejector(requestedRecords)).then(null, makeRecordsRejector(requestedRecords));
          } else if (ids.length === 1) {
            var pair = _ember.default.A(pendingFetchItems).findBy('record', groupOfRecords[0]);
            _fetchRecord(pair);
          } else {}
        });
      } else {
        pendingFetchItems.forEach(_fetchRecord);
      }
    },

    /**
      Get the reference for the specified record.
       Example
       ```javascript
      var userRef = store.getReference('user', 1);
       // check if the user is loaded
      var isLoaded = userRef.value() !== null;
       // get the record of the reference (null if not yet available)
      var user = userRef.value();
       // get the identifier of the reference
      if (userRef.remoteType() === "id") {
      var id = userRef.id();
      }
       // load user (via store.find)
      userRef.load().then(...)
       // or trigger a reload
      userRef.reload().then(...)
       // provide data for reference
      userRef.push({ id: 1, username: "@user" }).then(function(user) {
      userRef.value() === user;
      });
      ```
       @method getReference
      @param {String} type
      @param {String|Integer} id
      @since 2.5.0
      @return {RecordReference}
    */
    getReference: function (type, id) {
      return this._internalModelForId(type, id).recordReference;
    },

    /**
      Get a record by a given type and ID without triggering a fetch.
       This method will synchronously return the record if it is available in the store,
      otherwise it will return `null`. A record is available if it has been fetched earlier, or
      pushed manually into the store.
       _Note: This is an synchronous method and does not return a promise._
       ```js
      var post = store.peekRecord('post', 1);
       post.get('id'); // 1
      ```
       @since 1.13.0
      @method peekRecord
      @param {String} modelName
      @param {String|Integer} id
      @return {DS.Model|null} record
    */
    peekRecord: function (modelName, id) {
      if (this.hasRecordForId(modelName, id)) {
        return this._internalModelForId(modelName, id).getRecord();
      } else {
        return null;
      }
    },

    /**
      This method is called by the record's `reload` method.
       This method calls the adapter's `find` method, which returns a promise. When
      **that** promise resolves, `reloadRecord` will resolve the promise returned
      by the record's `reload`.
       @method reloadRecord
      @private
      @param {DS.Model} internalModel
      @return {Promise} promise
    */
    reloadRecord: function (internalModel) {
      var modelName = internalModel.type.modelName;
      var adapter = this.adapterFor(modelName);
      var id = internalModel.id;

      return this.scheduleFetch(internalModel);
    },

    /**
      Returns true if a record for a given type and ID is already loaded.
       @method hasRecordForId
      @param {(String|DS.Model)} modelName
      @param {(String|Integer)} inputId
      @return {Boolean}
    */
    hasRecordForId: function (modelName, inputId) {
      var typeClass = this.modelFor(modelName);
      var id = (0, _emberDataPrivateSystemCoerceId.default)(inputId);
      var internalModel = this.typeMapFor(typeClass).idToRecord[id];
      return !!internalModel && internalModel.isLoaded();
    },

    /**
      Returns id record for a given type and ID. If one isn't already loaded,
      it builds a new record and leaves it in the `empty` state.
       @method recordForId
      @private
      @param {String} modelName
      @param {(String|Integer)} id
      @return {DS.Model} record
    */
    recordForId: function (modelName, id) {
      return this._internalModelForId(modelName, id).getRecord();
    },

    _internalModelForId: function (typeName, inputId) {
      var typeClass = this.modelFor(typeName);
      var id = (0, _emberDataPrivateSystemCoerceId.default)(inputId);
      var idToRecord = this.typeMapFor(typeClass).idToRecord;
      var record = idToRecord[id];

      if (!record || !idToRecord[id]) {
        record = this.buildInternalModel(typeClass, id);
      }

      return record;
    },

    /**
      @method findMany
      @private
      @param {Array} internalModels
      @return {Promise} promise
    */
    findMany: function (internalModels) {
      var finds = new Array(internalModels.length);

      for (var i = 0; i < internalModels.length; i++) {
        finds[i] = this._findByInternalModel(internalModels[i]);
      }

      return Promise.all(finds);
    },

    /**
      If a relationship was originally populated by the adapter as a link
      (as opposed to a list of IDs), this method is called when the
      relationship is fetched.
       The link (which is usually a URL) is passed through unchanged, so the
      adapter can make whatever request it wants.
       The usual use-case is for the server to register a URL as a link, and
      then use that URL in the future to make a request for the relationship.
       @method findHasMany
      @private
      @param {DS.Model} owner
      @param {any} link
      @param {(Relationship)} relationship
      @return {Promise} promise
    */
    findHasMany: function (owner, link, relationship) {
      var adapter = this.adapterFor(owner.type.modelName);

      return (0, _emberDataPrivateSystemStoreFinders._findHasMany)(adapter, this, owner, link, relationship);
    },

    /**
      @method findBelongsTo
      @private
      @param {DS.Model} owner
      @param {any} link
      @param {Relationship} relationship
      @return {Promise} promise
    */
    findBelongsTo: function (owner, link, relationship) {
      var adapter = this.adapterFor(owner.type.modelName);

      return (0, _emberDataPrivateSystemStoreFinders._findBelongsTo)(adapter, this, owner, link, relationship);
    },

    /**
      This method delegates a query to the adapter. This is the one place where
      adapter-level semantics are exposed to the application.
       Exposing queries this way seems preferable to creating an abstract query
      language for all server-side queries, and then require all adapters to
      implement them.
       ---
       If you do something like this:
       ```javascript
      store.query('person', { page: 1 });
      ```
       The call made to the server, using a Rails backend, will look something like this:
       ```
      Started GET "/api/v1/person?page=1"
      Processing by Api::V1::PersonsController#index as HTML
      Parameters: { "page"=>"1" }
      ```
       ---
       If you do something like this:
       ```javascript
      store.query('person', { ids: [1, 2, 3] });
      ```
       The call to the server, using a Rails backend, will look something like this:
       ```
      Started GET "/api/v1/person?ids%5B%5D=1&ids%5B%5D=2&ids%5B%5D=3"
      Processing by Api::V1::PersonsController#index as HTML
      Parameters: { "ids" => ["1", "2", "3"] }
      ```
       This method returns a promise, which is resolved with an
      [`AdapterPopulatedRecordArray`](http://emberjs.com/api/data/classes/DS.AdapterPopulatedRecordArray.html)
      once the server returns.
       @since 1.13.0
      @method query
      @param {String} modelName
      @param {any} query an opaque query to be used by the adapter
      @return {Promise} promise
    */
    query: function (modelName, query) {
      return this._query(modelName, query);
    },

    _query: function (modelName, query, array) {
      var typeClass = this.modelFor(modelName);
      array = array || this.recordArrayManager.createAdapterPopulatedRecordArray(typeClass, query);

      var adapter = this.adapterFor(modelName);

      var pA = (0, _emberDataPrivateSystemPromiseProxies.promiseArray)((0, _emberDataPrivateSystemStoreFinders._query)(adapter, this, typeClass, query, array));

      return pA;
    },

    /**
      This method makes a request for one record, where the `id` is not known
      beforehand (if the `id` is known, use `findRecord` instead).
       This method can be used when it is certain that the server will return a
      single object for the primary data.
       Let's assume our API provides an endpoint for the currently logged in user
      via:
       ```
      // GET /api/current_user
      {
        user: {
          id: 1234,
          username: 'admin'
        }
      }
      ```
       Since the specific `id` of the `user` is not known beforehand, we can use
      `queryRecord` to get the user:
       ```javascript
      store.queryRecord('user', {}).then(function(user) {
        let username = user.get('username');
        console.log(`Currently logged in as ${username}`);
      });
      ```
       The request is made through the adapters' `queryRecord`:
       ```javascript
      // app/adapters/user.js
      import DS from "ember-data";
       export default DS.Adapter.extend({
        queryRecord(modelName, query) {
          return Ember.$.getJSON("/api/current_user");
        }
      });
      ```
       Note: the primary use case for `store.queryRecord` is when a single record
      is queried and the `id` is not known beforehand. In all other cases
      `store.query` and using the first item of the array is likely the preferred
      way:
       ```
      // GET /users?username=unique
      {
        data: [{
          id: 1234,
          type: 'user',
          attributes: {
            username: "unique"
          }
        }]
      }
      ```
       ```javascript
      store.query('user', { username: 'unique' }).then(function(users) {
        return users.get('firstObject');
      }).then(function(user) {
        let id = user.get('id');
      });
      ```
       This method returns a promise, which resolves with the found record.
       If the adapter returns no data for the primary data of the payload, then
      `queryRecord` resolves with `null`:
       ```
      // GET /users?username=unique
      {
        data: null
      }
      ```
       ```javascript
      store.queryRecord('user', { username: 'unique' }).then(function(user) {
        console.log(user); // null
      });
      ```
       @since 1.13.0
      @method queryRecord
      @param {String} modelName
      @param {any} query an opaque query to be used by the adapter
      @return {Promise} promise which resolves with the found record or `null`
    */
    queryRecord: function (modelName, query) {

      var typeClass = this.modelFor(modelName);
      var adapter = this.adapterFor(modelName);

      return (0, _emberDataPrivateSystemPromiseProxies.promiseObject)((0, _emberDataPrivateSystemStoreFinders._queryRecord)(adapter, this, typeClass, query));
    },

    /**
      `findAll` asks the adapter's `findAll` method to find the records for the
      given type, and returns a promise which will resolve with all records of
      this type present in the store, even if the adapter only returns a subset
      of them.
       ```app/routes/authors.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        model: function(params) {
          return this.store.findAll('author');
        }
      });
      ```
       _When_ the returned promise resolves depends on the reload behavior,
      configured via the passed `options` hash and the result of the adapter's
      `shouldReloadAll` method.
       ### Reloading
       If `{ reload: true }` is passed or `adapter.shouldReloadAll` evaluates to
      `true`, then the returned promise resolves once the adapter returns data,
      regardless if there are already records in the store:
       ```js
      store.push({
        data: {
          id: 'first',
          type: 'author'
        }
      });
       // adapter#findAll resolves with
      // [
      //   {
      //     id: 'second',
      //     type: 'author'
      //   }
      // ]
      store.findAll('author', { reload: true }).then(function(authors) {
        authors.getEach("id"); // ['first', 'second']
      });
      ```
       If no reload is indicated via the abovementioned ways, then the promise
      immediately resolves with all the records currently loaded in the store.
       ### Background Reloading
       Optionally, if `adapter.shouldBackgroundReloadAll` evaluates to `true`,
      then a background reload is started. Once this resolves, the array with
      which the promise resolves, is updated automatically so it contains all the
      records in the store:
       ```js
      // app/adapters/application.js
      export default DS.Adapter.extend({
        shouldReloadAll(store, snapshotsArray) {
          return false;
        },
         shouldBackgroundReloadAll(store, snapshotsArray) {
          return true;
        }
      });
       // ...
       store.push({
        data: {
          id: 'first',
          type: 'author'
        }
      });
       var allAuthors;
      store.findAll('author').then(function(authors) {
        authors.getEach('id'); // ['first']
         allAuthors = authors;
      });
       // later, once adapter#findAll resolved with
      // [
      //   {
      //     id: 'second',
      //     type: 'author'
      //   }
      // ]
       allAuthors.getEach('id'); // ['first', 'second']
      ```
       If you would like to force or prevent background reloading, you can set a
      boolean value for `backgroundReload` in the options object for
      `findAll`.
       ```app/routes/post/edit.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        model: function() {
          return this.store.findAll('post', { backgroundReload: false });
        }
      });
      ```
       If you pass an object on the `adapterOptions` property of the options
      argument it will be passed to you adapter via the `snapshotRecordArray`
       ```app/routes/posts.js
      import Ember from 'ember';
       export default Ember.Route.extend({
        model: function(params) {
          return this.store.findAll('post', {
            adapterOptions: { subscribe: false }
          });
        }
      });
      ```
       ```app/adapters/post.js
      import MyCustomAdapter from './custom-adapter';
       export default MyCustomAdapter.extend({
        findAll: function(store, type, sinceToken, snapshotRecordArray) {
          if (snapshotRecordArray.adapterOptions.subscribe) {
            // ...
          }
          // ...
        }
      });
      ```
        See [peekAll](#method_peekAll) to get an array of current records in the
      store, without waiting until a reload is finished.
       See [query](#method_query) to only get a subset of records from the server.
       @since 1.13.0
      @method findAll
      @param {String} modelName
      @param {Object} options
      @return {Promise} promise
    */
    findAll: function (modelName, options) {

      var typeClass = this.modelFor(modelName);

      var fetch = this._fetchAll(typeClass, this.peekAll(modelName), options);

      return fetch;
    },

    /**
      @method _fetchAll
      @private
      @param {DS.Model} typeClass
      @param {DS.RecordArray} array
      @return {Promise} promise
    */
    _fetchAll: function (typeClass, array, options) {
      options = options || {};
      var adapter = this.adapterFor(typeClass.modelName);
      var sinceToken = this.typeMapFor(typeClass).metadata.since;

      if (options.reload) {
        set(array, 'isUpdating', true);
        return (0, _emberDataPrivateSystemPromiseProxies.promiseArray)((0, _emberDataPrivateSystemStoreFinders._findAll)(adapter, this, typeClass, sinceToken, options));
      }

      var snapshotArray = array.createSnapshot(options);

      if (adapter.shouldReloadAll(this, snapshotArray)) {
        set(array, 'isUpdating', true);
        return (0, _emberDataPrivateSystemPromiseProxies.promiseArray)((0, _emberDataPrivateSystemStoreFinders._findAll)(adapter, this, typeClass, sinceToken, options));
      }

      if (options.backgroundReload === false) {
        return (0, _emberDataPrivateSystemPromiseProxies.promiseArray)(Promise.resolve(array));
      }

      if (options.backgroundReload || adapter.shouldBackgroundReloadAll(this, snapshotArray)) {
        set(array, 'isUpdating', true);
        (0, _emberDataPrivateSystemStoreFinders._findAll)(adapter, this, typeClass, sinceToken, options);
      }

      return (0, _emberDataPrivateSystemPromiseProxies.promiseArray)(Promise.resolve(array));
    },

    /**
      @method didUpdateAll
      @param {DS.Model} typeClass
      @private
    */
    didUpdateAll: function (typeClass) {
      var liveRecordArray = this.recordArrayManager.liveRecordArrayFor(typeClass);
      set(liveRecordArray, 'isUpdating', false);
    },

    /**
      This method returns a filtered array that contains all of the
      known records for a given type in the store.
       Note that because it's just a filter, the result will contain any
      locally created records of the type, however, it will not make a
      request to the backend to retrieve additional records. If you
      would like to request all the records from the backend please use
      [store.findAll](#method_findAll).
       Also note that multiple calls to `peekAll` for a given type will always
      return the same `RecordArray`.
       Example
       ```javascript
      var localPosts = store.peekAll('post');
      ```
       @since 1.13.0
      @method peekAll
      @param {String} modelName
      @return {DS.RecordArray}
    */
    peekAll: function (modelName) {
      var typeClass = this.modelFor(modelName);

      var liveRecordArray = this.recordArrayManager.liveRecordArrayFor(typeClass);
      this.recordArrayManager.populateLiveRecordArray(liveRecordArray, typeClass);

      return liveRecordArray;
    },

    /**
     This method unloads all records in the store.
      Optionally you can pass a type which unload all records for a given type.
      ```javascript
     store.unloadAll();
     store.unloadAll('post');
     ```
      @method unloadAll
     @param {String} modelName
    */
    unloadAll: function (modelName) {
      if (arguments.length === 0) {
        var typeMaps = this.typeMaps;
        var keys = Object.keys(typeMaps);
        var types = new Array(keys.length);

        for (var i = 0; i < keys.length; i++) {
          types[i] = typeMaps[keys[i]]['type'].modelName;
        }

        types.forEach(this.unloadAll, this);
      } else {
        var typeClass = this.modelFor(modelName);
        var typeMap = this.typeMapFor(typeClass);
        var records = typeMap.records.slice();
        var record = undefined;

        for (var i = 0; i < records.length; i++) {
          record = records[i];
          record.unloadRecord();
          record.destroy(); // maybe within unloadRecord
        }

        typeMap.metadata = new _emberDataPrivateSystemEmptyObject.default();
      }
    },

    /**
      Takes a type and filter function, and returns a live RecordArray that
      remains up to date as new records are loaded into the store or created
      locally.
       The filter function takes a materialized record, and returns true
      if the record should be included in the filter and false if it should
      not.
       Example
       ```javascript
      store.filter('post', function(post) {
        return post.get('unread');
      });
      ```
       The filter function is called once on all records for the type when
      it is created, and then once on each newly loaded or created record.
       If any of a record's properties change, or if it changes state, the
      filter function will be invoked again to determine whether it should
      still be in the array.
       Optionally you can pass a query, which is the equivalent of calling
      [query](#method_query) with that same query, to fetch additional records
      from the server. The results returned by the server could then appear
      in the filter if they match the filter function.
       The query itself is not used to filter records, it's only sent to your
      server for you to be able to do server-side filtering. The filter
      function will be applied on the returned results regardless.
       Example
       ```javascript
      store.filter('post', { unread: true }, function(post) {
        return post.get('unread');
      }).then(function(unreadPosts) {
        unreadPosts.get('length'); // 5
        var unreadPost = unreadPosts.objectAt(0);
        unreadPost.set('unread', false);
        unreadPosts.get('length'); // 4
      });
      ```
       @method filter
      @private
      @param {String} modelName
      @param {Object} query optional query
      @param {Function} filter
      @return {DS.PromiseArray}
      @deprecated
    */
    filter: function (modelName, query, filter) {

      if (!_ember.default.ENV.ENABLE_DS_FILTER) {}

      var promise;
      var length = arguments.length;
      var array;
      var hasQuery = length === 3;

      // allow an optional server query
      if (hasQuery) {
        promise = this.query(modelName, query);
      } else if (arguments.length === 2) {
        filter = query;
      }

      modelName = this.modelFor(modelName);

      if (hasQuery) {
        array = this.recordArrayManager.createFilteredRecordArray(modelName, filter, query);
      } else {
        array = this.recordArrayManager.createFilteredRecordArray(modelName, filter);
      }

      promise = promise || Promise.resolve(array);

      return (0, _emberDataPrivateSystemPromiseProxies.promiseArray)(promise.then(function () {
        return array;
      }, null, 'DS: Store#filter of ' + modelName));
    },

    /**
      This method returns if a certain record is already loaded
      in the store. Use this function to know beforehand if a findRecord()
      will result in a request or that it will be a cache hit.
        Example
       ```javascript
      store.recordIsLoaded('post', 1); // false
      store.findRecord('post', 1).then(function() {
        store.recordIsLoaded('post', 1); // true
      });
      ```
       @method recordIsLoaded
      @param {String} modelName
      @param {string} id
      @return {boolean}
    */
    recordIsLoaded: function (modelName, id) {
      return this.hasRecordForId(modelName, id);
    },

    // ............
    // . UPDATING .
    // ............

    /**
      If the adapter updates attributes the record will notify
      the store to update its  membership in any filters.
      To avoid thrashing, this method is invoked only once per
      run loop per record.
       @method dataWasUpdated
      @private
      @param {Class} type
      @param {InternalModel} internalModel
    */
    dataWasUpdated: function (type, internalModel) {
      this.recordArrayManager.recordDidChange(internalModel);
    },

    // ..............
    // . PERSISTING .
    // ..............

    /**
      This method is called by `record.save`, and gets passed a
      resolver for the promise that `record.save` returns.
       It schedules saving to happen at the end of the run loop.
       @method scheduleSave
      @private
      @param {InternalModel} internalModel
      @param {Resolver} resolver
      @param {Object} options
    */
    scheduleSave: function (internalModel, resolver, options) {
      var snapshot = internalModel.createSnapshot(options);
      internalModel.flushChangedAttributes();
      internalModel.adapterWillCommit();
      this._pendingSave.push({
        snapshot: snapshot,
        resolver: resolver
      });
      once(this, 'flushPendingSave');
    },

    /**
      This method is called at the end of the run loop, and
      flushes any records passed into `scheduleSave`
       @method flushPendingSave
      @private
    */
    flushPendingSave: function () {
      var _this = this;

      var pending = this._pendingSave.slice();
      this._pendingSave = [];

      pending.forEach(function (pendingItem) {
        var snapshot = pendingItem.snapshot;
        var resolver = pendingItem.resolver;
        var record = snapshot._internalModel;
        var adapter = _this.adapterFor(record.type.modelName);
        var operation;

        if (get(record, 'currentState.stateName') === 'root.deleted.saved') {
          return resolver.resolve();
        } else if (record.isNew()) {
          operation = 'createRecord';
        } else if (record.isDeleted()) {
          operation = 'deleteRecord';
        } else {
          operation = 'updateRecord';
        }

        resolver.resolve(_commit(adapter, _this, operation, snapshot));
      });
    },

    /**
      This method is called once the promise returned by an
      adapter's `createRecord`, `updateRecord` or `deleteRecord`
      is resolved.
       If the data provides a server-generated ID, it will
      update the record and the store's indexes.
       @method didSaveRecord
      @private
      @param {InternalModel} internalModel the in-flight internal model
      @param {Object} data optional data (see above)
    */
    didSaveRecord: function (internalModel, dataArg) {
      var data;
      if (dataArg) {
        data = dataArg.data;
      }
      if (data) {
        // normalize relationship IDs into records
        this._backburner.schedule('normalizeRelationships', this, '_setupRelationships', internalModel, data);
        this.updateId(internalModel, data);
      } else {}

      //We first make sure the primary data has been updated
      //TODO try to move notification to the user to the end of the runloop
      internalModel.adapterDidCommit(data);
    },

    /**
      This method is called once the promise returned by an
      adapter's `createRecord`, `updateRecord` or `deleteRecord`
      is rejected with a `DS.InvalidError`.
       @method recordWasInvalid
      @private
      @param {InternalModel} internalModel
      @param {Object} errors
    */
    recordWasInvalid: function (internalModel, errors) {
      internalModel.adapterDidInvalidate(errors);
    },

    /**
      This method is called once the promise returned by an
      adapter's `createRecord`, `updateRecord` or `deleteRecord`
      is rejected (with anything other than a `DS.InvalidError`).
       @method recordWasError
      @private
      @param {InternalModel} internalModel
      @param {Error} error
    */
    recordWasError: function (internalModel, error) {
      internalModel.adapterDidError(error);
    },

    /**
      When an adapter's `createRecord`, `updateRecord` or `deleteRecord`
      resolves with data, this method extracts the ID from the supplied
      data.
       @method updateId
      @private
      @param {InternalModel} internalModel
      @param {Object} data
    */
    updateId: function (internalModel, data) {
      var oldId = internalModel.id;
      var id = (0, _emberDataPrivateSystemCoerceId.default)(data.id);

      // ID absolutely can't be missing if the oldID is empty (missing Id in response for a new record)

      // ID absolutely can't be different than oldID if oldID is not null

      // ID can be null if oldID is not null (altered ID in response for a record)
      // however, this is more than likely a developer error.
      if (oldId !== null && id === null) {
        return;
      }

      this.typeMapFor(internalModel.type).idToRecord[id] = internalModel;

      internalModel.setId(id);
    },

    /**
      Returns a map of IDs to client IDs for a given type.
       @method typeMapFor
      @private
      @param {DS.Model} typeClass
      @return {Object} typeMap
    */
    typeMapFor: function (typeClass) {
      var typeMaps = get(this, 'typeMaps');
      var guid = _ember.default.guidFor(typeClass);
      var typeMap = typeMaps[guid];

      if (typeMap) {
        return typeMap;
      }

      typeMap = {
        idToRecord: new _emberDataPrivateSystemEmptyObject.default(),
        records: [],
        metadata: new _emberDataPrivateSystemEmptyObject.default(),
        type: typeClass
      };

      typeMaps[guid] = typeMap;

      return typeMap;
    },

    // ................
    // . LOADING DATA .
    // ................

    /**
      This internal method is used by `push`.
       @method _load
      @private
      @param {(String|DS.Model)} type
      @param {Object} data
    */
    _load: function (data) {
      var internalModel = this._internalModelForId(data.type, data.id);

      internalModel.setupData(data);

      this.recordArrayManager.recordDidChange(internalModel);

      return internalModel;
    },

    /*
      In case someone defined a relationship to a mixin, for example:
      ```
        var Comment = DS.Model.extend({
          owner: belongsTo('commentable'. { polymorphic: true})
        });
        var Commentable = Ember.Mixin.create({
          comments: hasMany('comment')
        });
      ```
      we want to look up a Commentable class which has all the necessary
      relationship metadata. Thus, we look up the mixin and create a mock
      DS.Model, so we can access the relationship CPs of the mixin (`comments`)
      in this case
    */

    _modelForMixin: function (modelName) {
      var normalizedModelName = (0, _emberDataPrivateSystemNormalizeModelName.default)(modelName);
      // container.registry = 2.1
      // container._registry = 1.11 - 2.0
      // container = < 1.11
      var owner = (0, _emberDataPrivateUtils.getOwner)(this);

      var mixin = owner._lookupFactory('mixin:' + normalizedModelName);
      if (mixin) {
        //Cache the class as a model
        owner.register('model:' + normalizedModelName, _emberDataModel.default.extend(mixin));
      }
      var factory = this.modelFactoryFor(normalizedModelName);
      if (factory) {
        factory.__isMixin = true;
        factory.__mixin = mixin;
      }

      return factory;
    },

    /**
      Returns the model class for the particular `modelName`.
       The class of a model might be useful if you want to get a list of all the
      relationship names of the model, see
      [`relationshipNames`](http://emberjs.com/api/data/classes/DS.Model.html#property_relationshipNames)
      for example.
       @method modelFor
      @param {String} modelName
      @return {DS.Model}
    */
    modelFor: function (modelName) {

      var factory = this.modelFactoryFor(modelName);
      if (!factory) {
        //Support looking up mixins as base types for polymorphic relationships
        factory = this._modelForMixin(modelName);
      }
      if (!factory) {
        throw new _ember.default.Error("No model was found for '" + modelName + "'");
      }
      factory.modelName = factory.modelName || (0, _emberDataPrivateSystemNormalizeModelName.default)(modelName);

      return factory;
    },

    modelFactoryFor: function (modelName) {
      var normalizedKey = (0, _emberDataPrivateSystemNormalizeModelName.default)(modelName);

      var owner = (0, _emberDataPrivateUtils.getOwner)(this);

      return owner._lookupFactory('model:' + normalizedKey);
    },

    /**
      Push some data for a given type into the store.
       This method expects normalized [JSON API](http://jsonapi.org/) document. This means you have to follow [JSON API specification](http://jsonapi.org/format/) with few minor adjustments:
      - record's `type` should always be in singular, dasherized form
      - members (properties) should be camelCased
       [Your primary data should be wrapped inside `data` property](http://jsonapi.org/format/#document-top-level):
       ```js
      store.push({
        data: {
          // primary data for single record of type `Person`
          id: '1',
          type: 'person',
          attributes: {
            firstName: 'Daniel',
            lastName: 'Kmak'
          }
        }
      });
      ```
       [Demo.](http://ember-twiddle.com/fb99f18cd3b4d3e2a4c7)
       `data` property can also hold an array (of records):
       ```js
      store.push({
        data: [
          // an array of records
          {
            id: '1',
            type: 'person',
            attributes: {
              firstName: 'Daniel',
              lastName: 'Kmak'
            }
          },
          {
            id: '2',
            type: 'person',
            attributes: {
              firstName: 'Tom',
              lastName: 'Dale'
            }
          }
        ]
      });
      ```
       [Demo.](http://ember-twiddle.com/69cdbeaa3702159dc355)
       There are some typical properties for `JSONAPI` payload:
      * `id` - mandatory, unique record's key
      * `type` - mandatory string which matches `model`'s dasherized name in singular form
      * `attributes` - object which holds data for record attributes - `DS.attr`'s declared in model
      * `relationships` - object which must contain any of the following properties under each relationships' respective key (example path is `relationships.achievements.data`):
        - [`links`](http://jsonapi.org/format/#document-links)
        - [`data`](http://jsonapi.org/format/#document-resource-object-linkage) - place for primary data
        - [`meta`](http://jsonapi.org/format/#document-meta) - object which contains meta-information about relationship
       For this model:
       ```app/models/person.js
      import DS from 'ember-data';
       export default DS.Model.extend({
        firstName: DS.attr('string'),
        lastName: DS.attr('string'),
         children: DS.hasMany('person')
      });
      ```
       To represent the children as IDs:
       ```js
      {
        data: {
          id: '1',
          type: 'person',
          attributes: {
            firstName: 'Tom',
            lastName: 'Dale'
          },
          relationships: {
            children: {
              data: [
                {
                  id: '2',
                  type: 'person'
                },
                {
                  id: '3',
                  type: 'person'
                },
                {
                  id: '4',
                  type: 'person'
                }
              ]
            }
          }
        }
      }
      ```
       [Demo.](http://ember-twiddle.com/343e1735e034091f5bde)
       To represent the children relationship as a URL:
       ```js
      {
        data: {
          id: '1',
          type: 'person',
          attributes: {
            firstName: 'Tom',
            lastName: 'Dale'
          },
          relationships: {
            children: {
              links: {
                related: '/people/1/children'
              }
            }
          }
        }
      }
      ```
       If you're streaming data or implementing an adapter, make sure
      that you have converted the incoming data into this form. The
      store's [normalize](#method_normalize) method is a convenience
      helper for converting a json payload into the form Ember Data
      expects.
       ```js
      store.push(store.normalize('person', data));
      ```
       This method can be used both to push in brand new
      records, as well as to update existing records.
       @method push
      @param {Object} data
      @return {DS.Model|Array} the record(s) that was created or
        updated.
    */
    push: function (data) {
      var included = data.included;
      var i, length;
      if (included) {
        for (i = 0, length = included.length; i < length; i++) {
          this._pushInternalModel(included[i]);
        }
      }

      if (Array.isArray(data.data)) {
        length = data.data.length;
        var internalModels = new Array(length);
        for (i = 0; i < length; i++) {
          internalModels[i] = this._pushInternalModel(data.data[i]).getRecord();
        }

        return internalModels;
      }

      if (data.data === null) {
        return null;
      }

      var internalModel = this._pushInternalModel(data.data);

      var record = internalModel.getRecord();

      return record;
    },

    _hasModelFor: function (type) {
      return !!(0, _emberDataPrivateUtils.getOwner)(this)._lookupFactory('model:' + type);
    },

    _pushInternalModel: function (data) {
      var _this2 = this;

      var modelName = data.type;

      // Actually load the record into the store.
      var internalModel = this._load(data);

      this._backburner.join(function () {
        _this2._backburner.schedule('normalizeRelationships', _this2, '_setupRelationships', internalModel, data);
      });

      return internalModel;
    },

    _setupRelationships: function (record, data) {
      // This will convert relationships specified as IDs into DS.Model instances
      // (possibly unloaded) and also create the data structures used to track
      // relationships.
      setupRelationships(this, record, data);
    },

    /**
      Push some raw data into the store.
       This method can be used both to push in brand new
      records, as well as to update existing records. You
      can push in more than one type of object at once.
      All objects should be in the format expected by the
      serializer.
       ```app/serializers/application.js
      import DS from 'ember-data';
       export default DS.ActiveModelSerializer;
      ```
       ```js
      var pushData = {
        posts: [
          { id: 1, post_title: "Great post", comment_ids: [2] }
        ],
        comments: [
          { id: 2, comment_body: "Insightful comment" }
        ]
      }
       store.pushPayload(pushData);
      ```
       By default, the data will be deserialized using a default
      serializer (the application serializer if it exists).
       Alternatively, `pushPayload` will accept a model type which
      will determine which serializer will process the payload.
       ```app/serializers/application.js
      import DS from 'ember-data';
       export default DS.ActiveModelSerializer;
      ```
       ```app/serializers/post.js
      import DS from 'ember-data';
       export default DS.JSONSerializer;
      ```
       ```js
      store.pushPayload('comment', pushData); // Will use the application serializer
      store.pushPayload('post', pushData); // Will use the post serializer
      ```
       @method pushPayload
      @param {String} modelName Optionally, a model type used to determine which serializer will be used
      @param {Object} inputPayload
    */
    pushPayload: function (modelName, inputPayload) {
      var _this3 = this;

      var serializer;
      var payload;
      if (!inputPayload) {
        payload = modelName;
        serializer = defaultSerializer(this);
      } else {
        payload = inputPayload;

        serializer = this.serializerFor(modelName);
      }
      if (false) {
        return this._adapterRun(function () {
          return serializer.pushPayload(_this3, payload);
        });
      } else {
        this._adapterRun(function () {
          return serializer.pushPayload(_this3, payload);
        });
      }
    },

    /**
      `normalize` converts a json payload into the normalized form that
      [push](#method_push) expects.
       Example
       ```js
      socket.on('message', function(message) {
        var modelName = message.model;
        var data = message.data;
        store.push(store.normalize(modelName, data));
      });
      ```
       @method normalize
      @param {String} modelName The name of the model type for this payload
      @param {Object} payload
      @return {Object} The normalized payload
    */
    normalize: function (modelName, payload) {
      var serializer = this.serializerFor(modelName);
      var model = this.modelFor(modelName);
      return serializer.normalize(model, payload);
    },

    /**
      Build a brand new record for a given type, ID, and
      initial data.
       @method buildRecord
      @private
      @param {DS.Model} type
      @param {String} id
      @param {Object} data
      @return {InternalModel} internal model
    */
    buildInternalModel: function (type, id, data) {
      var typeMap = this.typeMapFor(type);
      var idToRecord = typeMap.idToRecord;

      // lookupFactory should really return an object that creates
      // instances with the injections applied
      var internalModel = new _emberDataPrivateSystemModelInternalModel.default(type, id, this, null, data);

      // if we're creating an item, this process will be done
      // later, once the object has been persisted.
      if (id) {
        idToRecord[id] = internalModel;
      }

      typeMap.records.push(internalModel);

      return internalModel;
    },

    //Called by the state machine to notify the store that the record is ready to be interacted with
    recordWasLoaded: function (record) {
      this.recordArrayManager.recordWasLoaded(record);
    },

    // ...............
    // . DESTRUCTION .
    // ...............

    /**
      When a record is destroyed, this un-indexes it and
      removes it from any record arrays so it can be GCed.
       @method _dematerializeRecord
      @private
      @param {InternalModel} internalModel
    */
    _dematerializeRecord: function (internalModel) {
      var type = internalModel.type;
      var typeMap = this.typeMapFor(type);
      var id = internalModel.id;

      internalModel.updateRecordArrays();

      if (id) {
        delete typeMap.idToRecord[id];
      }

      var loc = typeMap.records.indexOf(internalModel);
      typeMap.records.splice(loc, 1);
    },

    // ......................
    // . PER-TYPE ADAPTERS
    // ......................

    /**
      Returns an instance of the adapter for a given type. For
      example, `adapterFor('person')` will return an instance of
      `App.PersonAdapter`.
       If no `App.PersonAdapter` is found, this method will look
      for an `App.ApplicationAdapter` (the default adapter for
      your entire application).
       If no `App.ApplicationAdapter` is found, it will return
      the value of the `defaultAdapter`.
       @method adapterFor
      @public
      @param {String} modelName
      @return DS.Adapter
    */
    adapterFor: function (modelName) {

      return this.lookupAdapter(modelName);
    },

    _adapterRun: function (fn) {
      return this._backburner.run(fn);
    },

    // ..............................
    // . RECORD CHANGE NOTIFICATION .
    // ..............................

    /**
      Returns an instance of the serializer for a given type. For
      example, `serializerFor('person')` will return an instance of
      `App.PersonSerializer`.
       If no `App.PersonSerializer` is found, this method will look
      for an `App.ApplicationSerializer` (the default serializer for
      your entire application).
       if no `App.ApplicationSerializer` is found, it will attempt
      to get the `defaultSerializer` from the `PersonAdapter`
      (`adapterFor('person')`).
       If a serializer cannot be found on the adapter, it will fall back
      to an instance of `DS.JSONSerializer`.
       @method serializerFor
      @public
      @param {String} modelName the record to serialize
      @return {DS.Serializer}
    */
    serializerFor: function (modelName) {

      var fallbacks = ['application', this.adapterFor(modelName).get('defaultSerializer'), '-default'];

      var serializer = this.lookupSerializer(modelName, fallbacks);
      return serializer;
    },

    /**
      Retrieve a particular instance from the
      container cache. If not found, creates it and
      placing it in the cache.
       Enabled a store to manage local instances of
      adapters and serializers.
       @method retrieveManagedInstance
      @private
      @param {String} modelName the object modelName
      @param {String} name the object name
      @param {Array} fallbacks the fallback objects to lookup if the lookup for modelName or 'application' fails
      @return {Ember.Object}
    */
    retrieveManagedInstance: function (type, modelName, fallbacks) {
      var normalizedModelName = (0, _emberDataPrivateSystemNormalizeModelName.default)(modelName);

      var instance = this._instanceCache.get(type, normalizedModelName, fallbacks);
      set(instance, 'store', this);
      return instance;
    },

    lookupAdapter: function (name) {
      return this.retrieveManagedInstance('adapter', name, this.get('_adapterFallbacks'));
    },

    _adapterFallbacks: _ember.default.computed('adapter', function () {
      var adapter = this.get('adapter');
      return ['application', adapter, '-json-api'];
    }),

    lookupSerializer: function (name, fallbacks) {
      return this.retrieveManagedInstance('serializer', name, fallbacks);
    },

    willDestroy: function () {
      this._super.apply(this, arguments);
      this.recordArrayManager.destroy();

      this.unloadAll();
    }

  });

  function deserializeRecordId(store, key, relationship, id) {
    if (isNone(id)) {
      return;
    }

    //TODO:Better asserts
    return store._internalModelForId(id.type, id.id);
  }

  function deserializeRecordIds(store, key, relationship, ids) {
    if (isNone(ids)) {
      return;
    }

    var _ids = new Array(ids.length);

    for (var i = 0; i < ids.length; i++) {
      _ids[i] = deserializeRecordId(store, key, relationship, ids[i]);
    }

    return _ids;
  }

  // Delegation to the adapter and promise management

  function defaultSerializer(store) {
    return store.serializerFor('application');
  }

  function _commit(adapter, store, operation, snapshot) {
    var internalModel = snapshot._internalModel;
    var modelName = snapshot.modelName;
    var typeClass = store.modelFor(modelName);
    var promise = adapter[operation](store, typeClass, snapshot);
    var serializer = (0, _emberDataPrivateSystemStoreSerializers.serializerForAdapter)(store, adapter, modelName);
    var label = 'DS: Extract and notify about ' + operation + ' completion of ' + internalModel;

    promise = Promise.resolve(promise, label);
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, store));
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, internalModel));

    return promise.then(function (adapterPayload) {
      store._adapterRun(function () {
        var payload, data;
        if (adapterPayload) {
          payload = (0, _emberDataPrivateSystemStoreSerializerResponse.normalizeResponseHelper)(serializer, store, typeClass, adapterPayload, snapshot.id, operation);
          if (payload.included) {
            store.push({ data: payload.included });
          }
          data = payload.data;
        }
        store.didSaveRecord(internalModel, { data: data });
      });

      return internalModel;
    }, function (error) {
      if (error instanceof _emberDataAdaptersErrors.InvalidError) {
        var errors = serializer.extractErrors(store, typeClass, error, snapshot.id);
        store.recordWasInvalid(internalModel, errors);
      } else {
        store.recordWasError(internalModel, error);
      }

      throw error;
    }, label);
  }

  function setupRelationships(store, record, data) {
    if (!data.relationships) {
      return;
    }

    record.type.eachRelationship(function (key, descriptor) {
      var kind = descriptor.kind;

      if (!data.relationships[key]) {
        return;
      }

      var relationship;

      if (data.relationships[key].links && data.relationships[key].links.related) {
        var relatedLink = (0, _emberDataPrivateSystemNormalizeLink.default)(data.relationships[key].links.related);
        if (relatedLink && relatedLink.href) {
          relationship = record._relationships.get(key);
          relationship.updateLink(relatedLink.href);
        }
      }

      if (data.relationships[key].meta) {
        relationship = record._relationships.get(key);
        relationship.updateMeta(data.relationships[key].meta);
      }

      // If the data contains a relationship that is specified as an ID (or IDs),
      // normalizeRelationship will convert them into DS.Model instances
      // (possibly unloaded) before we push the payload into the store.
      normalizeRelationship(store, key, descriptor, data.relationships[key]);

      var value = data.relationships[key].data;

      if (value !== undefined) {
        if (kind === 'belongsTo') {
          relationship = record._relationships.get(key);
          relationship.setCanonicalRecord(value);
        } else if (kind === 'hasMany') {
          relationship = record._relationships.get(key);
          relationship.updateRecordsFromAdapter(value);
        }
      }
    });
  }

  function normalizeRelationship(store, key, relationship, jsonPayload) {
    var data = jsonPayload.data;
    if (data) {
      var kind = relationship.kind;
      if (kind === 'belongsTo') {
        jsonPayload.data = deserializeRecordId(store, key, relationship, data);
      } else if (kind === 'hasMany') {
        jsonPayload.data = deserializeRecordIds(store, key, relationship, data);
      }
    }
  }

  exports.Store = Store;
  exports.default = Store;
});
/**
  @module ember-data
*/

// If Ember.ENV.DS_WARN_ON_UNKNOWN_KEYS is set to true and the payload
// contains unknown attributes or relationships, log a warning.

// Check unknown attributes

// Check unknown relationships
define('ember-data/-private/system/store/common', ['exports', 'ember'], function (exports, _ember) {
  exports._bind = _bind;
  exports._guard = _guard;
  exports._objectIsAlive = _objectIsAlive;

  var get = _ember.default.get;

  function _bind(fn) {
    var args = Array.prototype.slice.call(arguments, 1);

    return function () {
      return fn.apply(undefined, args);
    };
  }

  function _guard(promise, test) {
    var guarded = promise['finally'](function () {
      if (!test()) {
        guarded._subscribers.length = 0;
      }
    });

    return guarded;
  }

  function _objectIsAlive(object) {
    return !(get(object, "isDestroyed") || get(object, "isDestroying"));
  }
});
define('ember-data/-private/system/store/container-instance-cache', ['exports', 'ember', 'ember-data/-private/system/empty-object'], function (exports, _ember, _emberDataPrivateSystemEmptyObject) {
  exports.default = ContainerInstanceCache;

  var assign = _ember.default.assign || _ember.default.merge;

  /*
   * The `ContainerInstanceCache` serves as a lazy cache for looking up
   * instances of serializers and adapters. It has some additional logic for
   * finding the 'fallback' adapter or serializer.
   *
   * The 'fallback' adapter or serializer is an adapter or serializer that is looked up
   * when the preferred lookup fails. For example, say you try to look up `adapter:post`,
   * but there is no entry (app/adapters/post.js in EmberCLI) for `adapter:post` in the registry.
   *
   * The `fallbacks` array passed will then be used; the first entry in the fallbacks array
   * that exists in the container will then be cached for `adapter:post`. So, the next time you
   * look up `adapter:post`, you'll get the `adapter:application` instance (or whatever the fallback
   * was if `adapter:application` doesn't exist).
   *
   * @private
   * @class ContainerInstanceCache
   *
  */

  function ContainerInstanceCache(owner) {
    this._owner = owner;
    this._cache = new _emberDataPrivateSystemEmptyObject.default();
  }

  ContainerInstanceCache.prototype = new _emberDataPrivateSystemEmptyObject.default();

  assign(ContainerInstanceCache.prototype, {
    get: function (type, preferredKey, fallbacks) {
      var cache = this._cache;
      var preferredLookupKey = type + ':' + preferredKey;

      if (!(preferredLookupKey in cache)) {
        var instance = this.instanceFor(preferredLookupKey) || this._findInstance(type, fallbacks);
        if (instance) {
          cache[preferredLookupKey] = instance;
        }
      }
      return cache[preferredLookupKey];
    },

    _findInstance: function (type, fallbacks) {
      for (var i = 0, _length = fallbacks.length; i < _length; i++) {
        var fallback = fallbacks[i];
        var lookupKey = type + ':' + fallback;
        var instance = this.instanceFor(lookupKey);

        if (instance) {
          return instance;
        }
      }
    },

    instanceFor: function (key) {
      var cache = this._cache;
      if (!cache[key]) {
        var instance = this._owner.lookup(key);
        if (instance) {
          cache[key] = instance;
        }
      }
      return cache[key];
    },

    destroy: function () {
      var cache = this._cache;
      var cacheEntries = Object.keys(cache);

      for (var i = 0, _length2 = cacheEntries.length; i < _length2; i++) {
        var cacheKey = cacheEntries[i];
        var cacheEntry = cache[cacheKey];
        if (cacheEntry) {
          cacheEntry.destroy();
        }
      }
      this._owner = null;
    },

    constructor: ContainerInstanceCache,

    toString: function () {
      return 'ContainerInstanceCache';
    }
  });
});
/* global heimdall */
define("ember-data/-private/system/store/finders", ["exports", "ember", "ember-data/-private/debug", "ember-data/-private/system/store/common", "ember-data/-private/system/store/serializer-response", "ember-data/-private/system/store/serializers"], function (exports, _ember, _emberDataPrivateDebug, _emberDataPrivateSystemStoreCommon, _emberDataPrivateSystemStoreSerializerResponse, _emberDataPrivateSystemStoreSerializers) {
  exports._find = _find;
  exports._findMany = _findMany;
  exports._findHasMany = _findHasMany;
  exports._findBelongsTo = _findBelongsTo;
  exports._findAll = _findAll;
  exports._query = _query;
  exports._queryRecord = _queryRecord;

  var Promise = _ember.default.RSVP.Promise;

  function payloadIsNotBlank(adapterPayload) {
    if (Array.isArray(adapterPayload)) {
      return true;
    } else {
      return Object.keys(adapterPayload || {}).length;
    }
  }

  function _find(adapter, store, typeClass, id, internalModel, options) {
    var snapshot = internalModel.createSnapshot(options);
    var promise = adapter.findRecord(store, typeClass, id, snapshot);
    var serializer = (0, _emberDataPrivateSystemStoreSerializers.serializerForAdapter)(store, adapter, internalModel.type.modelName);
    var label = "DS: Handle Adapter#findRecord of " + typeClass + " with id: " + id;

    promise = Promise.resolve(promise, label);
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, store));

    return promise.then(function (adapterPayload) {
      return store._adapterRun(function () {
        var payload = (0, _emberDataPrivateSystemStoreSerializerResponse.normalizeResponseHelper)(serializer, store, typeClass, adapterPayload, id, 'findRecord');

        //TODO Optimize
        var record = store.push(payload);
        return record._internalModel;
      });
    }, function (error) {
      internalModel.notFound();
      if (internalModel.isEmpty()) {
        internalModel.unloadRecord();
      }

      throw error;
    }, "DS: Extract payload of '" + typeClass + "'");
  }

  function _findMany(adapter, store, typeClass, ids, internalModels) {
    var snapshots = _ember.default.A(internalModels).invoke('createSnapshot');
    var promise = adapter.findMany(store, typeClass, ids, snapshots);
    var serializer = (0, _emberDataPrivateSystemStoreSerializers.serializerForAdapter)(store, adapter, typeClass.modelName);
    var label = "DS: Handle Adapter#findMany of " + typeClass;

    if (promise === undefined) {
      throw new Error('adapter.findMany returned undefined, this was very likely a mistake');
    }

    promise = Promise.resolve(promise, label);
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, store));

    return promise.then(function (adapterPayload) {
      return store._adapterRun(function () {
        var payload = (0, _emberDataPrivateSystemStoreSerializerResponse.normalizeResponseHelper)(serializer, store, typeClass, adapterPayload, null, 'findMany');
        //TODO Optimize, no need to materialize here
        var records = store.push(payload);
        var internalModels = new Array(records.length);

        for (var i = 0; i < records.length; i++) {
          internalModels[i] = records[i]._internalModel;
        }

        return internalModels;
      });
    }, null, "DS: Extract payload of " + typeClass);
  }

  function _findHasMany(adapter, store, internalModel, link, relationship) {
    var snapshot = internalModel.createSnapshot();
    var typeClass = store.modelFor(relationship.type);
    var promise = adapter.findHasMany(store, snapshot, link, relationship);
    var serializer = (0, _emberDataPrivateSystemStoreSerializers.serializerForAdapter)(store, adapter, relationship.type);
    var label = "DS: Handle Adapter#findHasMany of " + internalModel + " : " + relationship.type;

    promise = Promise.resolve(promise, label);
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, store));
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, internalModel));

    return promise.then(function (adapterPayload) {
      return store._adapterRun(function () {
        var payload = (0, _emberDataPrivateSystemStoreSerializerResponse.normalizeResponseHelper)(serializer, store, typeClass, adapterPayload, null, 'findHasMany');
        //TODO Use a non record creating push
        var records = store.push(payload);
        var recordArray = records.map(function (record) {
          return record._internalModel;
        });
        recordArray.meta = payload.meta;
        return recordArray;
      });
    }, null, "DS: Extract payload of " + internalModel + " : hasMany " + relationship.type);
  }

  function _findBelongsTo(adapter, store, internalModel, link, relationship) {
    var snapshot = internalModel.createSnapshot();
    var typeClass = store.modelFor(relationship.type);
    var promise = adapter.findBelongsTo(store, snapshot, link, relationship);
    var serializer = (0, _emberDataPrivateSystemStoreSerializers.serializerForAdapter)(store, adapter, relationship.type);
    var label = "DS: Handle Adapter#findBelongsTo of " + internalModel + " : " + relationship.type;

    promise = Promise.resolve(promise, label);
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, store));
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, internalModel));

    return promise.then(function (adapterPayload) {
      return store._adapterRun(function () {
        var payload = (0, _emberDataPrivateSystemStoreSerializerResponse.normalizeResponseHelper)(serializer, store, typeClass, adapterPayload, null, 'findBelongsTo');

        if (!payload.data) {
          return null;
        }

        //TODO Optimize
        var record = store.push(payload);
        return record._internalModel;
      });
    }, null, "DS: Extract payload of " + internalModel + " : " + relationship.type);
  }

  function _findAll(adapter, store, typeClass, sinceToken, options) {
    var modelName = typeClass.modelName;
    var recordArray = store.peekAll(modelName);
    var snapshotArray = recordArray.createSnapshot(options);
    var promise = adapter.findAll(store, typeClass, sinceToken, snapshotArray);
    var serializer = (0, _emberDataPrivateSystemStoreSerializers.serializerForAdapter)(store, adapter, modelName);
    var label = "DS: Handle Adapter#findAll of " + typeClass;

    promise = Promise.resolve(promise, label);
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, store));

    return promise.then(function (adapterPayload) {
      store._adapterRun(function () {
        var payload = (0, _emberDataPrivateSystemStoreSerializerResponse.normalizeResponseHelper)(serializer, store, typeClass, adapterPayload, null, 'findAll');
        //TODO Optimize
        store.push(payload);
      });

      store.didUpdateAll(typeClass);
      return store.peekAll(modelName);
    }, null, "DS: Extract payload of findAll " + typeClass);
  }

  function _query(adapter, store, typeClass, query, recordArray) {
    var modelName = typeClass.modelName;
    var promise = adapter.query(store, typeClass, query, recordArray);

    var serializer = (0, _emberDataPrivateSystemStoreSerializers.serializerForAdapter)(store, adapter, modelName);
    var label = "DS: Handle Adapter#query of " + typeClass;

    promise = Promise.resolve(promise, label);
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, store));

    return promise.then(function (adapterPayload) {
      var records, payload;
      store._adapterRun(function () {
        payload = (0, _emberDataPrivateSystemStoreSerializerResponse.normalizeResponseHelper)(serializer, store, typeClass, adapterPayload, null, 'query');
        //TODO Optimize
        records = store.push(payload);
      });

      recordArray.loadRecords(records, payload);

      return recordArray;
    }, null, "DS: Extract payload of query " + typeClass);
  }

  function _queryRecord(adapter, store, typeClass, query) {
    var modelName = typeClass.modelName;
    var promise = adapter.queryRecord(store, typeClass, query);
    var serializer = (0, _emberDataPrivateSystemStoreSerializers.serializerForAdapter)(store, adapter, modelName);
    var label = "DS: Handle Adapter#queryRecord of " + typeClass;

    promise = Promise.resolve(promise, label);
    promise = (0, _emberDataPrivateSystemStoreCommon._guard)(promise, (0, _emberDataPrivateSystemStoreCommon._bind)(_emberDataPrivateSystemStoreCommon._objectIsAlive, store));

    return promise.then(function (adapterPayload) {
      var record;
      store._adapterRun(function () {
        var payload = (0, _emberDataPrivateSystemStoreSerializerResponse.normalizeResponseHelper)(serializer, store, typeClass, adapterPayload, null, 'queryRecord');

        //TODO Optimize
        record = store.push(payload);
      });

      return record;
    }, null, "DS: Extract payload of queryRecord " + typeClass);
  }
});
define('ember-data/-private/system/store/serializer-response', ['exports', 'ember', 'ember-data/-private/debug'], function (exports, _ember, _emberDataPrivateDebug) {
  exports.validateDocumentStructure = validateDocumentStructure;
  exports.normalizeResponseHelper = normalizeResponseHelper;

  /*
    This is a helper method that validates a JSON API top-level document
  
    The format of a document is described here:
    http://jsonapi.org/format/#document-top-level
  
    @method validateDocumentStructure
    @param {Object} doc JSON API document
    @return {array} An array of errors found in the document structure
  */

  function validateDocumentStructure(doc) {
    var errors = [];
    if (!doc || typeof doc !== 'object') {
      errors.push('Top level of a JSON API document must be an object');
    } else {
      if (!('data' in doc) && !('errors' in doc) && !('meta' in doc)) {
        errors.push('One or more of the following keys must be present: "data", "errors", "meta".');
      } else {
        if ('data' in doc && 'errors' in doc) {
          errors.push('Top level keys "errors" and "data" cannot both be present in a JSON API document');
        }
      }
      if ('data' in doc) {
        if (!(doc.data === null || Array.isArray(doc.data) || typeof doc.data === 'object')) {
          errors.push('data must be null, an object, or an array');
        }
      }
      if ('meta' in doc) {
        if (typeof doc.meta !== 'object') {
          errors.push('meta must be an object');
        }
      }
      if ('errors' in doc) {
        if (!Array.isArray(doc.errors)) {
          errors.push('errors must be an array');
        }
      }
      if ('links' in doc) {
        if (typeof doc.links !== 'object') {
          errors.push('links must be an object');
        }
      }
      if ('jsonapi' in doc) {
        if (typeof doc.jsonapi !== 'object') {
          errors.push('jsonapi must be an object');
        }
      }
      if ('included' in doc) {
        if (typeof doc.included !== 'object') {
          errors.push('included must be an array');
        }
      }
    }

    return errors;
  }

  /*
    This is a helper method that always returns a JSON-API Document.
  
    @method normalizeResponseHelper
    @param {DS.Serializer} serializer
    @param {DS.Store} store
    @param {subclass of DS.Model} modelClass
    @param {Object} payload
    @param {String|Number} id
    @param {String} requestType
    @return {Object} JSON-API Document
  */

  function normalizeResponseHelper(serializer, store, modelClass, payload, id, requestType) {
    var normalizedResponse = serializer.normalizeResponse(store, modelClass, payload, id, requestType);
    var validationErrors = [];

    return normalizedResponse;
  }
});
define("ember-data/-private/system/store/serializers", ["exports"], function (exports) {
  exports.serializerForAdapter = serializerForAdapter;

  function serializerForAdapter(store, adapter, type) {
    var serializer = adapter.serializer;

    if (serializer === undefined) {
      serializer = store.serializerFor(type);
    }

    if (serializer === null || serializer === undefined) {
      serializer = {
        extract: function (store, type, payload) {
          