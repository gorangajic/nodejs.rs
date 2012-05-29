var Post = require('../models/post'),
  Comment = require('../models/comment'),
  fs = require('fs'),
  path = require('path'),
  util = require('util'),
  contentPath = path.normalize(__dirname + '/../public/articles/'),
  HttpError = require('../httperror'),
  User = require('../models/user'),
  helpers = require('../helpers'),
  url = require('url');
  qs = require('querystring'),
  pdf = require('pdfcrowd'),
  credentials = require('../credentials');


/**
 * List action
 */

exports.list = function (req, res, next) {
  var page = +qs.parse(url.parse(req.url).query).page || 1;
  var itemCount = 5;

  Post.count(function (err, postCount) {
    if (err) return next(err);
    var pageCount = Math.ceil(postCount / itemCount) || 1;

    if (page < 0)
      page = 1; // show first page
    if (page > pageCount)
      page = pageCount; // show last page

    var previousPage = page - 1;
    var nextPage = page != pageCount ? page + 1 : null;

    Post.find({})
      .desc('createdAt')
      .skip((page - 1) * itemCount)
      .limit(itemCount)
      .populate('_owner', ['name.username']) // need only username
      .populate('comments', ['_id']) // need only count - none fields
      .run(function (err, posts) {
        if (err) return next(err);

        var length = posts.length;
        if (length) {
          posts.forEach(function (post) {
            var path = contentPath + post.titleUrl + '.md';
            fs.readFile(path, 'utf8', function (err, content) {
              if (err) return next(err);
              post.content = helpers.markdown(content.substring(0, 400));
              post.createdAtFormatted = helpers.formatDate(post.createdAt);
              if (--length === 0) res.emit('posts');
            });
          });
        } else {
          res.emit('posts');
        }
        res.on('posts', function () {
          res.render('post/list', {
            posts: posts,
            previousPage: previousPage,
            nextPage: nextPage
          });
        });
      });
  });
};

/**
 * New action
 */

exports.new = function (req, res, next) {
  var post = new Post();

  if (req.body.post) {
    var p = req.body.post;
    post.title = p.title;
    post._owner = req.session.user._id;
    post.tags = p.tags;

    if (!p.content.length) {
      post.errors = ['Sadržaj je obavezno polje.'];
      return res.render('post/new', { post: post });
    }

    var fileName = checkPostSecurity(post, function (err) {
      if (err) return next(err);
      post.save(function (err) {
        if (err) {
          if (~err.toString().indexOf('duplicate key'))
            post.errors = ['Naslov je već zauzet.'];

          post.content = p.content;
          res.render('post/new', { post: post });
        } else {
          fs.writeFile(fileName, p.content.trim(), function (err) {
            if (err) return next(err);
            req.flash('success', 'Novi članak uspešno kreiran.');
            res.redirect('/post');
          });
        }
      });
    });
  } else {
    res.render('post/new', { post: post });
  }
};


/**
 * View action
 */

exports.view = function (req, res, next) {

  function isLoggedIn() {
    return !!req.session.user;
  }

  function isAdmin() {
    for (var i = 0; i < credentials.admins.length; i++) {
      if (req.session.user.email === credentials.admins[i].email)
        return true;
    }
    return false;
  }

  function isPostOwner(post) {
    return req.session.user._id == post._owner._id;
  }

  function isCommentOwner(comment) {
    return req.session.user._id == comment._owner
  }

  Post.findWithFullDetails(req.params.postTitle, function (err, post) {
    if (err) return next(err);
    if (!post) return next(); // 404 will catch this...
    var fileName = checkPostSecurity(post, function (err) {
      if (err) return next(err);
      fs.readFile(fileName, 'utf8', function (err, file) {
        if (err) return next(err);

        post.content = helpers.markdown(file);

        post.createdAtFormatted = helpers.formatDateFine(post.createdAt);
        post.updatedAtFormatted = helpers.formatDateFine(post.updatedAt);

        var length = post.comments.length;

        if (length) {
          post.comments.forEach(function (comment) {
            User
              .findById(comment._owner, [ 'name.first', 'name.last', 'name.username', 'photo' ])
              .populate('photo', ['name', 'ext'])
              .run(function (err, user) {

              if (err) return next(err);

              comment._ownerUsername = user.name.username;
              comment._ownerFullName = user.name.full;
              comment.createdAtFormatted = helpers.formatDateFine(comment.createdAt);
              comment.cssClass = (isLoggedIn() && isCommentOwner(comment)) ? ['thread-alt', 'depth-1'] : 'depth-1';
              comment._ownerPhoto = user.photo.small;
              comment._ownerPhotoName = user.photo.name;

              comment.text = helpers.markdown(comment.text);

              if (--length === 0)
                res.emit('comments loaded');
            });
          });
          res.on('comments loaded', function () {
            handleSidebar(req, res, next, post, function () {
              res.render('post/view', {
                post: post,
                canEditPost: isLoggedIn() && (isPostOwner(post) || isAdmin())
              });
            });
          });
        } else {
          handleSidebar(req, res, next, post, function () {
            res.render('post/view', { 
              post: post,
              canEditPost: isLoggedIn() && (isPostOwner(post) || isAdmin())
            });
          });
        }
      });
    });
  });
};

/**
 * Download action
 */

exports.download = function (req, res, next) {

  function generateHtml(post, cb) {
    var path = contentPath + '/' + post.titleUrl + '.md';
    var author = post._owner.name.full || post._owner.name.username;

    // TODO: read minimized assets
    var hl = contentPath + '/../javascripts/highlight/highlight.pack.js';
    var gh = contentPath + '/../javascripts/highlight/styles/github.css';
    var css = contentPath + '/../stylesheets/coolblue.css';

    fs.readFile(path, 'utf8', function (err, file) {
      if (err) return cb(err);
      fs.readFile(hl, 'utf8', function (err, hl) {
        if (err) return cb(err);
        fs.readFile(gh, 'utf8', function (err, gh) {
          if (err) return cb(err);
          fs.readFile(css, 'utf8', function (err, css) {
            if (err) return cb(err);

            file = helpers.markdown(file);
            // trasform relative to absolute urls
            file = file.replace(
              /\<a class="raw-file" href="#([\w-_. ]+)"\>/g, 
              '<a class="raw-file" href="http://nodejs.rs/post/' + post.titleUrl + '/raw/$1">');

            var html = [
              '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
              '<html>',
              '  <head>',
              '    <title>' + post.title + ' - Node Srbija</title>',
              '    <meta charset="utf-8">',
              '    <script type="text/javascript">',
              '      ' + hl,
              '    </script>',
              '    <script type="text/javascript">',
              '      hljs.initHighlightingOnLoad();',
              '    </script>',
              '    <style type="text/css">',
              '      ' + gh,
              '    </style>',
              '    <style type="text/css">',
              '      ' + css,
              '    </style>',
              '  </head>',
              '  <body style="margin: 0 auto; width: 978px;">',
              '    <h3>',
              '      <a href="http://nodejs.rs/post/' + post.titleUrl + '">' + post.title + '</a>',
              '    </h3>',
              '    <div style="margin: 0 0 70px 3px; font-size: 14px;">',
              '      Napisao <a href="http://nodejs.rs/user/' + post._owner.name.username + '">' + author + '</a>, dana ' + helpers.formatDateFine(post.createdAt),
              '    </div>',
              '    ' + file,
              '    <div style="text-align: center; font-size: 0.8em;">',
              '      Preuzeto sa Node Srbija - <a href="http://nodejs.rs">http://nodejs.rs</a>',
              '    </div>',
              '  </body>',
              '</html>'
            ].join('\n');

            cb(null, html);
          });
        });
      });
    });
  }

  var conditions = { titleUrl: req.params.postTitle };
  Post.findOne(conditions).populate('_owner').run(function (err, post) {
    if (err) return next(err);
    if (!post) return next(); // 404

    var fileName = checkPostSecurity(post, function (err) {
      if (err) return next(err);
      var author = post._owner.name.full || post._owner.name.username;
      switch (req.params.format) {
        case 'md':
          fs.readFile(fileName, 'utf8', function (err, file) {
            if (err) return err.code === 'ENOENT' ? next() : next(err); // 404 or 500

            file = [
              '### [' + post.title + '](http://nodejs.rs/post/' + post.titleUrl + ')',
              'Napisao _[' + author + '](http://nodejs.rs/user/' + post._owner.name.username + ')_, dana ' + helpers.formatDateFine(post.createdAt),
              '\n\n'
            ].join('\n') + file;

            res.send(file, {
              'Content-Type': 'text/plain',
              'Content-Disposition': 'attachment; filename="' + post.titleUrl + '.md"'
            });
          });
        break;
        case 'pdf':
          generateHtml(post, function (err, html) {
            var client = new pdf.Pdfcrowd(credentials.pdf.username, credentials.pdf.password);
            client.convertHtml(
              html, {
                pdf: function (rstream) {
                  res.setHeader('Content-Type', 'application/pdf');
                  res.setHeader('Cache-Control', 'no-cache');
                  res.setHeader('Accept-Ranges', 'none');
                  res.setHeader('Content-Disposition', 'attachment; filename="' + post.titleUrl + '.pdf"');
                  rstream.pipe(res);
                  // on read end rstrim.pipe(res) will automatically call res.end()!
                },
                error: function (message, status) {
                  // forward as 500 to error handler
                  return next(new HttpError(status, message));
                },
                end: function () {
                  // opened for download count implementation
                }
              }, {
              author: author + ' - Node Srbija (http://nodejs.rs)',
              page_layout: 2,
              page_mode: 2
            });
          });
        break;
        default: // html
          generateHtml(post, function (err, html) {
            if (err) return next(err);
            res.send(html, {
              'Content-Disposition': 'attachment; filename="' + post.titleUrl + '.html"'
            });
          });
        break;
      }
    });
  });
};

/**
 * Delete action
 */
 
exports.delete = function (req, res, next) {
  Post.findById(req.params.postId).populate('comments').run(function (err, post) {
    if (err) return next(err);
    if (!post) return next(); // 404 will catch this...

    if (post.comments.length) { // remove subdocs - comments
      post.comments.forEach(function (v, i, a) {
        v.remove(function (err) {
          if (err) return next(err);
          if (i === a.length-1) res.emit('comments removed');
        });
      });
    } else {
      process.nextTick(function () {
        res.emit('comments removed');
      });
    }

    res.on('comments removed', function () {
      post.remove(function (err) {
        if (err) return next(err);
        fs.unlink(contentPath + post.titleUrl + '.md', function (err) {
          if (err) return next(err);
          req.flash('success', 'Uspešno obrisan članak.');
          res.end();
        });
      });
    });
  });
};

/**
 * Edit action
 */

exports.edit = function (req, res, next) {
  Post.findOne({ titleUrl: req.params.postTitle }, function (err, post) {
    if (err) return next(err);

    if (req.body.post) {
      var p = req.body.post;

      var originalTitleUrl = post.titleUrl;
      post.title = p.title;
      post.tags = p.tags;
      post.updatedAt = Date.now();

      if (!p.content.length) {
        post.errors = [ 'Sadržaj je obavezno polje.' ];
        handleSidebar(req, res, next, post, function () {
          res.render('post/edit', { post: post });
        });
        return;
      }

      var filePath = checkPostSecurity(post, function (err) {
        if (err) return next(err);
        post.save(function (err) {
          if (err) {
            if (~err.toString().indexOf('duplicate key')) {
              post.errors = [ 'Naslov je već zauzet.' ];
              post.titleUrl = originalTitleUrl;
            }

            post.content = p.content;
            handleSidebar(req, res, next, post, function () {
              res.render('post/edit', { post: post });
            });
            return;
          }

          fs.rename(contentPath + originalTitleUrl + '.md', filePath, function (err) {
            if (err) return next(err);
            fs.writeFile(filePath, p.content.trim(), function (err) {
              if (err) return next(err);
              req.flash('success', 'Uspešno izmenjen članak "' + helpers.encode(post.title) + '"');
              res.redirect('/post/' + post.titleUrl);
            });
          });
        });
      });
    } else {
      var filePath = checkPostSecurity(post, function (err) {
        if (err) return next(err);
        fs.readFile(filePath, 'utf8', function (err, file) {
          if (err) return next(err);
          post.content = file;
          handleSidebar(req, res, next, post, function () {
            res.render('post/edit', { post: post });
          });
        });
      });
    }
  });
};

/**
 * View raw file action
 */

exports.raw = function (req, res, next) {
  Post.findOne({ titleUrl: req.params.postTitle }).populate('comments').run(function (err, post) {
    if (err) return next(err);
    if (!post) return next(); // 404

    var name = req.params.name;
    var fileName = checkPostSecurity(post, function (err) {
      if (err) return next(err);
      fs.readFile(fileName, 'utf8', function (err, file) {
        if (err) return next(err);
        file = helpers.markdown(file, true);
        var startSearch = '<input type="hidden" value="[raw=' + name + ']" />',
          endSearch = '<input type="hidden" value="[/raw=' + name + ']" />',
          start = file.indexOf(startSearch),
          end = file.indexOf(endSearch),
          content = file.substring(start + startSearch.length, end);

          // no raw files found in post, try to find some in comments
          if (start === -1 || end === -1) {
            var length = post.comments.length;
            post.comments.forEach(function (comment) {
              comment.text = helpers.markdown(comment.text, true);
              start = comment.text.indexOf(startSearch);
              end = comment.text.indexOf(endSearch);
              content = comment.text.substring(start + startSearch.length, end);

              // found raw file in comment - respond and exit
              if (start !== -1 || end !== -1) {
               // stop here
               return res.send(content, { 'Content-Type': 'text/plain' });
              } else if (--length === 0) { // no raw files found in comments
                return next(); // 404
              }
            });
          } else { // found raw file
            res.send(content, { 'Content-Type': 'text/plain' });
          }
      });
    });

  });
};

/**
 * Post comment actions
 */

exports.comment = {

  /**
   * New comment action
   */

  new: function (req, res, next) {
    var comment = new Comment({
      _owner: req.session.user._id,
      text: req.body.post.comment
    });
    comment.save(function (err) {
      if (err) {
        var errors = [];
        for (var msg in err.errors)
          errors.push(err.errors[msg].message);

        req.flash('error', errors);
        return res.redirect('back');
      }
      req.post.comments.push(comment);
      req.post.save(function (err) {
        if (err) return next(err);
        req.flash('success', 'Novi komentar uspešno dodat.');
        res.redirect('/post/' + req.post.titleUrl);
      });
    });
  },

  /**
   * Delete comment action
   */

  delete: function (req, res, next) {
    Comment.findById(req.params.commentId, function (err, comment) {
      if (err) return next(err);
      if (!comment) return next();

      var _id = req.session.user._id;
      comment.remove(function (err) {
        if (err) return next(err);
        var pos = req.post.comments.indexOf(comment._id);
        req.post.comments.splice(pos, 1); // manually remove it... mongoose bug?

        if (req.post.comments.length === 0) {
          req.post.comments = undefined; // tell mongoose to remove comments key... mongoose bug?
        }

        req.post.save(function (err) {
          if (err) return next(err);
          if (req.xhr) {
            return res.send('Komentar uspešno obrisan.');
          } else {
            req.flash('success', 'Komentar uspešno obrisan.');
            res.redirect('/post/' + req.post.titleUrl);
          }
        });
      });
    });
  },

  /**
   * Edit comment action
   */

  edit: function (req, res, next) {
    Comment.findById(req.params.commentId, function (err, comment) {
      if (err) return next(err);
      if (!comment) return next();

      var _id = req.session.user._id;
      if (req.body.get) {
        return res.send(comment.text);
      } else {
        comment.text = req.body.text;
        comment.save(function (err) {
          if (req.xhr) { // ajax request
            if (err) return res.send({ err: err.errors.text.message });
            return res.send({
              text: helpers.markdown(comment.text),
              msg: 'Komentar uspešno izmenjen.'
            });
          } else {
            if (err) return next(err);
            req.flash('success', 'Komentar uspešno izmenjen.');
            res.redirect('/post/' + req.post.titleUrl);
          }
        });
      }
    });
  }
};


function checkPostSecurity(post, cb) {
  var normalizedTitle = post.normalizeTitle(post.title),
    fileName = path.join(contentPath, normalizedTitle + '.md');

  process.nextTick(function () {
    return (fileName.indexOf(contentPath) === 0 && !~fileName.indexOf('\0'))
      && !~fileName.indexOf('new.md')
      ? cb(null) : cb(new HttpError(400));
  });

  return fileName;
}

function handleSidebar(req, res, next, post, cb) {
  if (post._owner.length) {
    Post.findByAuthor(post._owner).ne('_id', post._id).run(function (err, posts) {
      if (err) return next(err);
      req.sidebar = {
        viewFile: 'post/_sidebar',
        data: {
          user: post._owner,
          posts: posts
        }
      };
      cb();
    });
  } else {
    User.findOne({ _id: post._owner}).populate('photo').run(function (err, user) {
      if (err) return next(err);
      Post.findByAuthor(post._owner).ne('_id', post._id).run(function (err, posts) {
        if (err) return next(err);
        req.sidebar = {
          viewFile: 'post/_sidebar',
          data: {
            user: user,
            posts: posts
          }
        };
        cb();
      });
    });
  }
}