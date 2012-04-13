    var db = require('./db'),
      imagemagick = require('imagemagick'),
      path = require('path'),
      storePath = path.join(__dirname, '/../public/images/users/'),
      test = String;

    var Picture = new db.Schema({
      path: String,
      name: String,
    });

    Picture.methods.crop = function (cb) {
      var opts = {
        srcPath: this.path,
        dstPath: storePath + this.name + '_small.jpg',
        width: 42,
        height: 42,
        quality: 1
      },
      self = this;

      imagemagick.crop(opts, function (err, stdout, stderr) {
        if (err) return cb(err);
        opts.dstPath = storePath + self.name + '_large.jpg';
        opts.width = 200;
        opts.height = 200;
        imagemagick.crop(opts, cb);
      });
    };

    function testHl() {
      parseInt();
      isNaN();
      var d = new Date().toString();
      /asdf/.test();
      // komentar
      window.document.getElementById('asdf');

      if (true) return false;
      var x = null || undefined;
    }

    module.exports = db.mongoose.model('Picture', Picture);

Ovo je cool

    var db = require('./db'),
      mail = require('mail').Mail({ host: 'localhost' }),
      EventEmitter = require('events').EventEmitter;

    const PRIORITY_HIGHEST = 1;
    const PRIORITY_HIGH = 2;
    const PRIORITY_NORMAL = 3;
    const PRIORITY_LOW = 4;
    const PRIORITY_LOWEST = 5;

    var types = {
      'register': 1,
    };

    var Email = new db.Schema({
      message: {
        from: { type: String, default: 'noreply@nodejs.rs' },
        to: [ String ],
        subject: String
      },
      body: String,
      sent: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
      sentAt: Date,
      type: { type: Number, default: 0 },
      priority: { type: Number, default: PRIORITY_NORMAL },
      sendingCounter: { type: Number, default: 0 }
    });

    Email.methods.send = function (cb) {
      var self = this;
      this.sendingCounter++;

      this.save(function (err) {
        if (err) cb(err);

        mail.message({
          from: self.message.from,
          to: self.message.to,
          subject: self.message.subject
        })
        .body(self.body)
        .send(function (err) {
          if (err) cb(err);

          self.sent = true;
          self.sentAt = Date.now();
          self.save(function (err) {
            if (err) cb(err);
            cb(null);
          });
        });
      });
    };

    Email.pre('save', function (next) {
      if (+this.type !== 0) {
        switch (+this.type) {
          case types['register']:
            this.message = {
              from: 'register@nodejs.rs',
              subject: 'Registracija na nodejs.rs'
            };
            this.body = [
              // 'Zdravo ' + bodyData['fullName'],
              // 'Ti si: ' + bodyData['category'],
              'Dobrodosli na Node.js Srbija',
              'Kliknite ovde za aktivaciju:<br />',
              'Ova poruka je poslata na ' + this.message.to[0]
            ].join('\n');
            this.priority = PRIORITY_HIGHEST;
          break;
        }
      }
      next();
    });

    Email.statics.types = types;

    // var bodyData = {};

    // Email.virtual('bodyData').set(function (data) {
    //   bodyData = data;
    // });


    // Email.prototype.__proto__ = EventEmitter.prototype;

    module.exports = db.mongoose.model('Email', Email);

I tako... `ovo je bio moj` **post** :-D

> a sad
    > adio `asdf`