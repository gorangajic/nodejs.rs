var qs = require('querystring'),
  url = require('url'),
  helpers = require('../helpers');

/**
 * Models
 */

var User = require('../models/user'),
  Email = require('../models/email'),
  Picture = require('../models/picture')
  Post = require('../models/post');

exports.index = function (req, res, next){
  res.render('index', { 
    title: 'Node Srbija'
  });
};

exports.search = function (req, res, next) {
	if (req.params.tag) {
		Post.where('tags').in([req.params.tag]).populate('_owner').run(function (err, posts) {
			if (err) return next(err);
			res.render('site/search', { posts: posts, q: req.params.tag });
		});
	} else {
		var q = qs.parse(url.parse(req.url).query).q;
		res.send(q);
	}
};

exports.about = function (req, res, next) {
  res.render('site/about');
};