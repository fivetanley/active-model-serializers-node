'use strict';

var rsvp = require('rsvp');
var Inflector = require('inflected');
var _ = require('lodash');

function Serializer(model, options) {
  this.model = model;
  this.options = options || {};
  this.attributes = this.constructor.prototype.attributes || [];
  this.belongTos = [];
  this.hasManys = [];
  if (this.options.rootKey) {
    this.rootKey = this.options.rootKey;
  }
}

Serializer.prototype.serialize = function(object){
  if (!this.model) {
    return rsvp.resolve(null);
  }

  return new rsvp.Promise(function(resolve, reject) {
    var attrs = this.attributes;
    var length = this.attributes.length;
    var rootKey = this.rootKey;
    var alreadySerialized = false;

    if (this.options.sideload) {
      rootKey = Inflector.pluralize(rootKey);
    }

    rootKey = Inflector.camelize(rootKey, false);

    if (object[rootKey] && Array.isArray(object[rootKey])) {
      var alreadySerialized = _.find(object[rootKey], function(model) {
        return model.guid == this.serializeAttribute('guid');
      }, this);
      if (alreadySerialized) {
        return resolve(null);
      }
    }

    var attribute;
    var i;
    var serialized = Object.create(null);

    for (i = 0; i < length; i++) {
      attribute = attrs[i];
      serialized[attribute] = this.serializeAttribute(attribute);
    }

    var belongTos = this.belongTos.map(function(belongsTo) {
      return this.serializeBelongsTo(belongsTo, object, serialized);
    }, this);

    var hasManys = this.hasManys.map(function(hasMany) {
      return this.serializeHasMany(hasMany, object, serialized);
    }, this);

    if (this.options.sideload) {
      object[rootKey] = object[rootKey] || [];
      object[rootKey].push(serialized);
    } else {
      object[rootKey] = serialized;
    }

    return rsvp.all(belongTos.concat(hasManys)).then(resolve)
    .catch(reject);

  }.bind(this));
};

Serializer.prototype.serializeAttribute = function(attribute){
  if (typeof this[attribute] === 'function') {
    return this[attribute]();
  }
  return this.model[attribute];
};

Serializer.prototype.serializeIntoHash = function(hash) {
  var rootKey = Inflector.pluralize(this.rootKey);
  var models = hash[rootKey] = hash[rootKey] || {};
};

Serializer.prototype.serializeBelongsTo = function(belongsTo, hash, modelHash) {
  var getter = 'get' + belongsTo.name;
  return this.model[getter]().then(function(relationship) {
    return new belongsTo.serializer(relationship, {rootKey: belongsTo.type, sideload: true}).serialize(hash).then(function(relationshipHash) {
      var belongsToKey = Inflector.camelize(belongsTo.name, false);
      modelHash[belongsToKey] = relationship && relationship[belongsTo.primaryKey];
      return hash;
    });
  });
};

Serializer.prototype.serializeHasMany = function(hasMany, hash, modelHash) {
  var hasManyName = Inflector.pluralize(hasMany.name);
  var getter = 'get' + Inflector.capitalize(hasManyName);
  return this.model[getter]().then(function(models) {
    return rsvp.map(models, function(relationship) {
      return new hasMany.serializer(relationship, {rootKey: hasMany.type, sideload: true}).serialize(hash);
    }).then(function(){
      return models.map(function(model) {
        return model[hasMany.primaryKey];
      });
    });
  }).then(function(ids) {
    modelHash[hasManyName.toLowerCase()] = ids;
    return hash;
  });
};

module.exports = Serializer;
