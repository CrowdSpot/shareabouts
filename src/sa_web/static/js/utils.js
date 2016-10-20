/*global _, moment, BinaryFile, loadImage, EXIF */

var Shareabouts = Shareabouts || {};

(function(S){
  'use strict';

  S.Util = {
    patch: function(obj, overrides, func) {
      var attr, originals = {};

      // Switch out for the override values, but save the originals
      for (attr in overrides) {
        originals[attr] = obj[attr];
        obj[attr] = overrides[attr];
      }

      // Run the function with the now patched object
      func();

      // Restore the original values
      for (attr in originals) {
        obj[attr] = originals[attr];
      }
    },

    setPrettyDateLang: function(locale) {
      moment.lang(locale);
    },

    getPrettyDateTime: function(datetime, format) {
      if (format) {
        return moment(datetime).format(format);
      } else {
        return moment(datetime).fromNow();
      }
    },

    getAttrs: function($form) {
      var attrs = {},
          multivalues = [];

      // Get values from the form. Make the item into an array if there are
      // multiple values in the form, as in the case of a set of check boxes or
      // a multiselect list.
      _.each($form.serializeArray(), function(item) {
        if (!_.isUndefined(attrs[item.name])) {
          if (!_.contains(multivalues, item.name)) {
            multivalues.push(item.name);
            attrs[item.name] = [attrs[item.name]];
          }
          attrs[item.name].push(item.value);
        } else {
          attrs[item.name] = item.value;
        }
      });

      return attrs;
    },

    isSupported: function(userAgent) {
      // Mobile Safari UIWebViews may not register as a recognized user agent,
      // so just assume that browsers that we understand are new and should be
      // supported.
      var recognized = (userAgent &&
                        userAgent.browser &&
                        userAgent.browser.name &&
                        userAgent.browser.version);
      if (!recognized) {
        return true;
      }

      switch (userAgent.browser.name) {
        case 'Chrome':
        case 'Firefox':
        case 'Safari':
        case 'ChromeiOS':
          return true;
        case 'Microsoft Internet Explorer':
          var firstDot = userAgent.browser.version.indexOf('.'),
              major = parseInt(userAgent.browser.version.substr(0, firstDot), 10);

          if (major > 7) {
            return true;
          }
      }

      return false;
    },

    // ====================================================
    // Event and State Logging

    log: function() {
      var args = Array.prototype.slice.call(arguments, 0);

      if (window.ga) {
        this.analytics(args);
      } else {
        S.Util.console.log(args);
      }
    },

    analytics: function(args) {
      var firstArg = args.shift(),
          secondArg,
          measure,
          measures = {
            'center-lat': 'metric1',
            'center-lng': 'metric2',
            'zoom': 'metric3',

            'panel-state': 'dimension1'
          };

      switch (firstArg.toLowerCase()) {
        case 'route':
          args = ['send', 'pageview'].concat(args);
          break;

        case 'user':
          args = ['send', 'event'].concat(args);
          break;

        case 'app':
          secondArg = args.shift();
          measure = measures[secondArg];
          if (!measure) {
            this.console.error('No metrics or dimensions matching "' + secondArg + '"');
            return;
          }
          args = ['set', measure].concat(args);
          break;

        default:
          return;
      }

      window.ga.apply(window, args);
    },

    // For browsers without a console
    console: window.console || {
      log: function(){},
      debug: function(){},
      info: function(){},
      warn: function(){},
      error: function(){}
    },

    classify: function(string) {
      return string.replace(/\W+/, '-').toLowerCase();
    },

    // ====================================================
    // File and Image Handling

    fileInputSupported: function() {
      // http://stackoverflow.com/questions/4127829/detect-browser-support-of-html-file-input-element
      var dummy = document.createElement('input');
      dummy.setAttribute('type', 'file');
      if (dummy.disabled) return false;

      // We also need support for the FileReader interface
      // https://developer.mozilla.org/en-US/docs/Web/API/FileReader
      var fr;
      if (!window.FileReader) return false;
      fr = new FileReader();
      if (!fr.readAsArrayBuffer) return false;

      return true;
    },

    fixImageOrientation: function(canvas, orientation) {
      var rotated = document.createElement('canvas'),
          ctx = rotated.getContext('2d'),
          width = canvas.width,
          height = canvas.height;

      switch (orientation) {
          case 5:
          case 6:
          case 7:
          case 8:
              rotated.width = canvas.height;
              rotated.height = canvas.width;
              break;
          default:
              rotated.width = canvas.width;
              rotated.height = canvas.height;
      }


      switch (orientation) {
          case 1:
              // nothing
              break;
          case 2:
              // horizontal flip
              ctx.translate(width, 0);
              ctx.scale(-1, 1);
              break;
          case 3:
              // 180 rotate left
              ctx.translate(width, height);
              ctx.rotate(Math.PI);
              break;
          case 4:
              // vertical flip
              ctx.translate(0, height);
              ctx.scale(1, -1);
              break;
          case 5:
              // vertical flip + 90 rotate right
              ctx.rotate(0.5 * Math.PI);
              ctx.scale(1, -1);
              break;
          case 6:
              // 90 rotate right
              ctx.rotate(0.5 * Math.PI);
              ctx.translate(0, -height);
              break;
          case 7:
              // horizontal flip + 90 rotate right
              ctx.rotate(0.5 * Math.PI);
              ctx.translate(width, -height);
              ctx.scale(-1, 1);
              break;
          case 8:
              // 90 rotate left
              ctx.rotate(-0.5 * Math.PI);
              ctx.translate(-width, 0);
              break;
          default:
              break;
      }

      ctx.drawImage(canvas, 0, 0);

      return rotated;
    },

    fileToCanvas: function(file, callback, options) {
      var fr = new FileReader();

      fr.onloadend = function() {
          // get EXIF data
          var exif = EXIF.readFromBinaryFile(new BinaryFile(this.result)),
              orientation = exif.Orientation;

          loadImage(file, function(canvas) {
            // rotate the image, if needed
            var rotated = S.Util.fixImageOrientation(canvas, orientation);
            callback(rotated);
          }, options);
      };

      fr.readAsArrayBuffer(file); // read the file
    },

    wrapHandler: function(evtName, model, origHandler) {
      var newHandler = function(evt) {
        model.trigger(evtName, evt);
        if (origHandler) {
          origHandler.apply(this, arguments);
        }
      };
      return newHandler;
    },

    callWithRetries: function(func, retryCount, context) {
      var args = Array.prototype.slice.call(arguments, 3),
          options = _.last(args),
          errorHandler = options.error,
          retries = 0;

      if (!options) {
        options = {};
        args.push(options);
      }

      options.error = function() {
        if (retries < retryCount) {
          retries++;
          setTimeout(function() {
            func.apply(context, args);
          }, retries * 100);
        } else {
          if (errorHandler) {
            errorHandler.apply(context, arguments);
          }
        }
      };

      func.apply(context, args);
    },

    // Cookies! Om nom nom
    // Thanks ppk! http://www.quirksmode.org/js/cookies.html
    cookies: {
      save: function(name,value,days) {
        var expires;
        if (days) {
          var date = new Date();
          date.setTime(date.getTime()+(days*24*60*60*1000));
          expires = '; expires='+date.toGMTString();
        }
        else {
          expires = '';
        }
        document.cookie = name+'='+value+expires+'; path=/';
      },
      get: function(name) {
        var nameEQ = name + '=';
        var ca = document.cookie.split(';');
        for(var i=0;i < ca.length;i++) {
          var c = ca[i];
          while (c.charAt(0) === ' ') {
            c = c.substring(1,c.length);
          }
          if (c.indexOf(nameEQ) === 0) {
            return c.substring(nameEQ.length,c.length);
          }
        }
        return null;
      },
      destroy: function(name) {
        this.save(name,'',-1);
      }
    },

    MapQuest: {
      geocode: function(location, bounds, options) {
        var mapQuestKey = S.bootstrapped.mapQuestKey;

        if (!mapQuestKey) throw "You must provide a MapQuest key for geocoding to work.";

        options = options || {};
        options.dataType = 'jsonp';
        options.cache = true;
        options.url = 'http://open.mapquestapi.com/geocoding/v1/address?key=' + mapQuestKey + '&location=' + location;
        if (bounds) {
          options.url += '&boundingBox=' + bounds.join(',');
        }
        $.ajax(options);
      },
      reverseGeocode: function(latLng, options) {
        var mapQuestKey = S.bootstrapped.mapQuestKey,
            lat, lng;

        if (!mapQuestKey) throw "You must provide a MapQuest key for geocoding to work.";

        lat = latLng.lat || latLng[0];
        lng = latLng.lng || latLng[1];
        options = options || {};
        options.dataType = 'jsonp';
        options.cache = true;
        options.url = 'http://open.mapquestapi.com/geocoding/v1/reverse?key=' + mapQuestKey + '&location=' + lat + ',' + lng;
        $.ajax(options);
      }
    },

    Mapbox: {
      /* ========================================
       * Because of an accident of history, geocoding with the MapQuest API was
       * implemented first in Shareabouts. Thus, in order for geocoder results
       * from anywhere else to be useful, they have to look like mapquest
       * results.
       *
       * TODO: I'd rather see both the mapquest and mapbox results look more
       * like GeoJSON, e.g. Carmen:
       *
       *     https://github.com/mapbox/carmen/blob/master/carmen-geojson.md
       */

      // L.mapbox.accessToken = 'pk.eyJ1Ijoib3BlbnBsYW5zIiwiYSI6ImNpZjVjdWxpMDBhMnVzcG0zYjZzaXcyczMifQ.lY5dtGpiFt2BvlywF1n59Q';
      // Shareabouts.geocoderControl = L.mapbox.geocoderControl('mapbox.places', {autocomplete: true});
      // window.app.appView.mapView.map.addControl(Shareabouts.geocoderControl);

      toMapQuestResult: function(result) {
        result.latLng = {lat: result.center[1], lng: result.center[0]};

        if (result.center)    delete result.center;
        if (result.relevance) delete result.relevance;
        if (result.address)   delete result.address;
        if (result.context)   delete result.context;
        if (result.bbox)      delete result.bbox;
        if (result.id)        delete result.id;
        if (result.text)      delete result.text;
        if (result.type)      delete result.type;

        return result;
      },
      toMapQuestResults: function(data) {
        // Make Mapbox reverse geocode results look kinda like
        // MapQuest results.
        data.results = data.features;
        if (data.results.length > 0) {
          data.results[0] = {
            locations: [ Shareabouts.Util.Mapbox.toMapQuestResult(data.results[0]) ],
            providedLocation: { location: data.query.join(' ') }
          };
        }
        return data;
      },

      geocode: function(location, hint, bounding_box, options) {
        var mapboxToken = S.bootstrapped.mapboxToken,
            originalSuccess = options && options.success,
            transformedResultsSuccess = function(data) {
              if (originalSuccess) {
                originalSuccess(Shareabouts.Util.Mapbox.toMapQuestResults(data));
              }
            };

        if (!mapboxToken) throw "You must provide a Mapbox access token " +
          "(Shareabouts.bootstrapped.mapboxToken) for geocoding to work.";

        options = options || {};
        options.dataType = 'json';
        options.cache = true;
        // https://api.mapbox.com/geocoding/v5/mapbox.places/White%20House%2C%201600%20Pennsylvania%20Ave%20NW%2C%20Washington%2C%20DC%2020500.json?country=us&proximity=38.8977%2C%2077.0365&bbox=-77.15%2C38.75%2C-76.9%2C39.1&types=poi&autocomplete=true&access_token=pk.eyJ1IjoiYWlzZXkiLCJhIjoiZVhQcWtnZyJ9.-YulcMjSuM7sQNxPYh26HQ
        options.url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(location) + '.json?autocomplete=false';
        if (hint) {
          options.url += '&proximity=' + hint.join(',');
        }
        if (bounding_box) {
          options.url += '&bbox=' + bounding_box.join(',');
        }
        options.url += '&access_token=' + mapboxToken;
        options.success = transformedResultsSuccess;
        $.ajax(options);
      },
      reverseGeocode: function(latLng, options) {
        var mapboxToken = S.bootstrapped.mapboxToken,
            lat, lng;

        if (!mapboxToken) throw "You must provide a Mapbox access token " +
          "(Shareabouts.bootstrapped.mapboxToken) for geocoding to work.";

        lat = latLng.lat || latLng[0];
        lng = latLng.lng || latLng[1];
        options = options || {};
        options.dataType = 'json';
        options.cache = true;
        options.url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + lng + ',' + lat + '.json?access_token=' + mapboxToken;
        $.ajax(options);
      }
    }

  };
}(Shareabouts));
