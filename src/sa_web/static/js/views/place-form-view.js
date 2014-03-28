var Shareabouts = Shareabouts || {};

(function(S, $, console){
  S.PlaceFormView = Backbone.View.extend({
    // View responsible for the form for adding and editing places.
    events: {
      'submit form': 'onSubmit',
      'change input[type="file"]': 'onInputFileChange',
      'change select[name=location_type]': 'onLocationTypeChange'
    },
    initialize: function(){
      S.TemplateHelpers.overridePlaceTypeConfig(this.options.placeConfig.items,
        this.options.defaultPlaceTypeName);
      S.TemplateHelpers.insertInputTypeFlags(this.options.placeConfig.items);

      // Bind model events
      this.model.on('error', this.onError, this);
    },
    render: function(){
      // Augment the model data with place types for the drop down
      var data = _.extend({
        place_config: this.options.placeConfig
      }, this.model.toJSON());
      
      this.$el.html(ich['place-form'](data));
      return this;
    },
    remove: function() {
      this.unbind();
    },
    onError: function(model, res) {
      // TODO handle model errors!
      console.log('oh no errors!!', model, res);
    },
    // Get the attributes from the form
    getAttrs: function() {
      var attrs = {},
          center = this.options.appView.getCenter();

      // Get values from the form
      _.each(this.$('form').serializeArray(), function(item, i) {
        attrs[item.name] = item.value;
      });

      // Get the location attributes from the map
      attrs.location = {
        lat: center.lat,
        lng: center.lng
      };

      return attrs;
    },
    // update the form with a class indicating the location type
    onLocationTypeChange: function(evt) {
      var self = this, $form = self.$('form');
      var lt_config = _.find(self.options.placeConfig.items, function(item) {
        return item.name === 'location_type'
      });
      var labelToClass = function(s) { return s.replace(/\W+/, '-')};
      // remove any existing classes
      _.each(lt_config.options, function(option) {
        $form.removeClass(labelToClass(option));
      });
      
      // add the new class
      $form.addClass(labelToClass($(evt.target).val()));
    },
    onInputFileChange: function(evt) {
      var self = this,
          file,
          attachment;

      if(evt.target.files && evt.target.files.length) {
        file = evt.target.files[0];

        this.$('.fileinput-name').text(file.name);
        S.Util.fileToCanvas(file, function(canvas) {
          canvas.toBlob(function(blob) {
            var fieldName = $(evt.target).attr('name'),
                data = {
                  name: fieldName,
                  blob: blob,
                  url: canvas.toDataURL('image/jpeg')
                };

            attachment = self.model.attachmentCollection.find(function(model) {
              return model.get('name') === fieldName;
            });

            if (_.isUndefined(attachment)) {
              self.model.attachmentCollection.add(data);
            } else {
              attachment.set(data);
            }
          }, 'image/jpeg');
        }, {
          // TODO: make configurable
          maxWidth: 800,
          maxHeight: 800,
          canvas: true
        });
      }
    },
    onSubmit: function(evt) {
      var router = this.options.router,
          model = this.model,
          // Should not include any files
          attrs = this.getAttrs(),
          $fileInputs;

      evt.preventDefault();
      
      // simple required validation
      var errors = '';
      _.each(this.options.placeConfig.items, function(item) {
        if (! item.optional && ! attrs[item.name]) {
          errors = errors + item.prompt + " is required. ";
        }
      });
      if (errors)
        return alert(errors);
      
      // Save and redirect
      this.model.save(attrs, {
        success: function() {
          S.justSubmitted = true;
          router.navigate('/place/' + model.id, {trigger: true});
        },
        wait: true
      });
    }
  });

})(Shareabouts, jQuery, Shareabouts.Util.console);
