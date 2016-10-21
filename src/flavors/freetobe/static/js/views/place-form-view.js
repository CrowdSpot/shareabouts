/*globals _ Spinner Handlebars Backbone jQuery Gatekeeper */

var Shareabouts = Shareabouts || {};

(function(S, $, console){
  S.PlaceFormView = Backbone.View.extend({
    // View responsible for the form for adding and editing places.
    events: {
      'submit form': 'onSubmit',
      'change input[type="file"]': 'onInputFileChange',
      'change select': 'onSelectChange',
      'change input[type=radio]': 'onSelectChange'
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
        place_config: this.options.placeConfig,
        user_token: this.options.userToken,
        current_user: S.currentUser
      }, S.stickyFieldValues, this.model.toJSON());

      this.$el.html(Handlebars.templates['place-form'](data));

      return this;
    },
    remove: function() {
      this.unbind();
    },
    onError: function(model, res) {
      // TODO handle model errors!
      console.log('oh no errors!!', model, res);
    },
    // This is called from the app view
    setLatLng: function(latLng) {
      this.center = latLng;
      this.$('.drag-marker-instructions, .drag-marker-warning').removeClass('show-form-item').addClass('hide-form-warnings');
      this.$('.place-form-container').addClass('show-form-item');
    },
    setLocation: function(location) {
      this.location = location;
    },
    // Get the attributes from the form
    getAttrs: function() {
      var self = this,
          attrs = {},
          locationAttr = this.options.placeConfig.location_item_name;

      // Get values from the form
      _.each(this.$('form').serializeArray(), function(item, i) {
        var name = item.name,
            value = item.value;

        // Check if the item appears in a multi-checkbox
        _.each(self.options.placeConfig.items, function(configItem, x) {
          if(configItem.is_multi_checkbox &&
             configItem.checkboxes.filter(function(checkbox) {
               return checkbox.name == item.name;
             }).length > 0
          ) {

            // This field belongs to a multi-checkbox, values are to be submitted in a list.
            name = configItem.name;

            if(attrs.hasOwnProperty(name)) {
              value = attrs[name];
            } else {
              value = new Array();
            }
            value.push(item.name);

          }
        });

        attrs[name] = value;

      });

      // Get the location attributes from the map
      attrs.geometry = {
        type: 'Point',
        coordinates: [this.center.lng, this.center.lat]
      };

      if (this.location && locationAttr) {
        attrs[locationAttr] = this.location;
      }

      return attrs;
    },
    // update the form with a class indicating the location type
    onSelectChange: function(evt) {
      var self = this, $form = self.$('form');
      var selectName = $(evt.target).attr('name');
      var selectConfig = _.find(self.options.placeConfig.items, function(item) {
        return item.name === selectName;
      });

      var prefix = '';

      if (selectName !== 'location_type') {
        prefix = S.Util.classify(selectName) + '-';
      }

      // remove any existing classes from both options and radios
      _.each(selectConfig.options, function(option) {
        $form.removeClass(prefix + S.Util.classify(option.value));
      });
      _.each(selectConfig.radios, function(radio) {
        $form.removeClass(prefix + S.Util.classify(radio.value));
      });

      // add the new class
      $form.addClass(prefix + S.Util.classify($(evt.target).val()));
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
                  file: canvas.toDataURL('image/jpeg')
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
    onSubmit: Gatekeeper.onValidSubmit(function(evt) {
      // Make sure that the center point has been set after the form was
      // rendered. If not, this is a good indication that the user neglected
      // to move the map to set it in the correct location.
      if (!this.center) {
        this.$('.drag-marker-instructions').addClass('is-visuallyhidden');
        this.$('.drag-marker-warning').removeClass('is-visuallyhidden');

        // Scroll to the top of the panel if desktop
        this.$el.parent('article').scrollTop(0);
        // Scroll to the top of the window, if mobile
        window.scrollTo(0, 0);
        return;
      }

      var router = this.options.router,
          model = this.model,
          // Should not include any files
          attrs = this.getAttrs(),
          $button = this.$('[name="save-place-btn"]'),
          spinner, $fileInputs;

      evt.preventDefault();

      $button.attr('disabled', 'disabled');
      spinner = new Spinner(S.smallSpinnerOptions).spin(this.$('.form-spinner')[0]);

      S.Util.log('USER', 'new-place', 'submit-place-btn-click');

      this.options.appView.setStickyFields(attrs, S.Config.survey.items, S.Config.place.items);

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
          S.Util.log('USER', 'new-place', 'successfully-add-place');
          S.justSubmitted = true;
          router.navigate('/place/' + model.id, {trigger: true});

          // Visitor added spot.
          _paq.push(['trackGoal', 1]);
          console.log('Visitor added spot');
        },
        error: function() {
          S.Util.log('USER', 'new-place', 'fail-to-add-place');
        },
        complete: function() {
          $button.removeAttr('disabled');
          spinner.stop();
        },
        wait: true
      });
    })
  });

}(Shareabouts, jQuery, Shareabouts.Util.console));