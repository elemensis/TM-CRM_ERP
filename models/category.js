"use strict";

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
        Schema = mongoose.Schema,
        timestamps = require('mongoose-timestamp'),
        tree = require('mongoose-path-tree'),
        streamWorker = require('stream-worker'),
        _ = require("lodash");

var setTags = function (tags) {
    var result = [];
    for (var i = 0; i < tags.length; i++)
        if (typeof tags[i] == "object" && tags[i].text)
            result.push(tags[i].text.trim());
        else
            result.push(tags[i].trim());

    result = _.uniq(result);

    //console.log(result);
    return result;
};

var gridfs = INCLUDE('gridfs');
var Dict = INCLUDE('dict');
/**
 * Category Schema
 */

var setLink = function (link) {
    if (!link)
        return null;

    link = link.replace(/ /g, "_");
    link = link.replace(/\//g, "");

    //console.log(result);
    return link;
};

var categorySchema = new Schema({
    oldId: String, // Only for import migration
    name: {type: String, required: true, unique: true}, //Meta Title
    description: {type: String, default: ""}, //Meta description
    body: {type: String, default: ""}, // Description HTML
    enabled: {type: Boolean, default: true},
    Tag: {type: [], set: setTags},
    entity: String,
    user_mod: {id: String, name: String},
    url: {type: String, unique: true, set: setLink}, // SEO URL short link
    linker: {type: String}, // Full Link with tree
    //parent: {type: String},
    idx: {type: Number, default: 0}//order in array for nodes
}, {
    toObject: {virtuals: true},
    toJSON: {virtuals: true}
});

categorySchema.plugin(tree, {
    pathSeparator: '#', // Default path separator
    onDelete: 'REPARENT', // Can be set to 'DELETE' or 'REPARENT'. Default: 'REPARENT'
    numWorkers: 5, // Number of stream workers
    idType: Schema.ObjectId  // Type used for _id. Can be, for example, String generated by shortid module
});
categorySchema.plugin(timestamps);
categorySchema.plugin(gridfs.pluginGridFs, {root: "Category"});


categorySchema.pre('save', function (next) {
    var self = this;

    if (!this.linker)
        this.linker = this.url;

    if (!this.body)
        this.body = this.description;

    var isUrlModified = this.isModified('url');
    var isParentModified = this.isModified('parent');

    if (this.isNew || isUrlModified || isParentModified) {
        if (this.parent)
            return this.collection.findOne({_id: this.parent}, function (err, doc) {

                if (err)
                    return next(err);

                var previousUrl = self.linker;
                self.linker = doc.linker + '/' + self.url;

                // When the parent is changed we must rewrite all children paths as well
                self.collection.find({linker: {'$regex': '^' + previousUrl + '[/]'}}, function (err, cursor) {

                    if (err) {
                        return next(err);
                    }

                    streamWorker(cursor.stream(), 5, function streamOnData(doc, done) {

                        var newUrl = self.linker + doc.linker.substr(previousUrl.length);
                        self.collection.update({_id: doc._id}, {$set: {linker: newUrl}}, done);
                    },
                            next);
                });


            });


        var previousUrl = self.linker;
        this.linker = this.url;

        // When the parent is changed we must rewrite all children paths as well
        self.collection.find({linker: {'$regex': '^' + previousUrl + '[/]'}}, function (err, cursor) {

            if (err) {
                return next(err);
            }
            

            streamWorker(cursor.stream(), 5, function streamOnData(doc, done) {

                var newUrl = self.linker + doc.linker.substr(previousUrl.length);
                self.collection.update({_id: doc._id}, {$set: {linker: newUrl}}, done);
            },
                    next);

        });


    } else
        next();
});

var dict = {};
Dict.dict({dictName: ['fk_product_status', 'fk_units'], object: true}, function (err, doc) {
    if (err) {
        console.log(err);
        return;
    }
    dict = doc;
});

exports.Schema = mongoose.model('category', categorySchema, 'Category');
exports.name = 'category';

