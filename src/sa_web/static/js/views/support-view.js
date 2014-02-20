var Shareabouts = Shareabouts || {};

(function(S, $, console){
  S.SupportView = Backbone.View.extend({
    events: {
      'change #support': 'onSupportChange'
    },

    initialize: function() {
      this.collection.on('reset', this.onChange, this);
      this.collection.on('add', this.onChange, this);
      this.collection.on('remove', this.onChange, this);

      this.updateSupportStatus();
    },

    render: function() {
      // I don't understand why we need to redelegate the event here, but they
      // are definitely unbound after the first render.
      this.delegateEvents();

      this.$el.html(ich['place-detail-support']({
        count: this.collection.size() || '',
        user_token: this.options.userToken,
        is_supporting: (this.userSupport !== undefined),
        support_config: this.options.supportConfig
      }));

      return this;
    },

    remove: function() {
      // Nothing yet
    },

    getSupportStatus: function(userToken) {
      return this.collection.find(function(model) {
        return model.get('user_token') === userToken;
      });
    },

    updateSupportStatus: function() {
      this.userSupport = this.getSupportStatus(this.options.userToken);
    },

    onChange: function() {
      this.updateSupportStatus();
      this.render();
    },

    onSupportChange: function(evt) {
      var self = this,
          checked = evt.target.checked,
          $form,
          attrs,
          userSupport;

      evt.target.disabled = true;

      if (checked) {
        $form = this.$('form'),
        attrs = S.Util.getAttrs($form);

        //PLACES-SUPPORT-HACK
        attrs.email_address = $('#user_support #email_address').val();
        var pattern = new RegExp(/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?$/i);
        if (pattern.test(attrs.email_address)) {
            this.collection.create(attrs, {
              wait: true,
              error: function() {
                self.getSupportStatus(self.options.userToken).destroy();
                alert('Oh dear. It looks like that didn\'t save.');
              }
            });
        } else {
            alert("Please enter a valid email address to support this spot. Your email will be kept confidential and will only be used to communicate results of this project and campaign for better public transport.")
            evt.target.checked = false;
            this.render()
        }

      } else {
        userSupport = this.userSupport;
        this.userSupport.destroy({
          wait: true,
          error: function() {
            self.collection.add(userSupport);
            alert('Oh dear. It looks like that didn\'t save.');
          }
        });
      }
    }
  });

})(Shareabouts, jQuery, Shareabouts.Util.console);
