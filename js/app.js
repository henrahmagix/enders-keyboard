(function (_, $, Backbone) {

    // Underscore settings.
    _.templateSettings.evaluate = /\{%([\s\S]+?)%\}/g;
    _.templateSettings.interpolate = /\{\{([\s\S]+?)\}\}/g;

    // Cross-browser helpers.
    var vendors = ['', 'o', 'ms', 'moz', 'webkit'];
    var cssPrefixes = _(vendors).map(function (vendor) {
        if (!vendor.length) {
            return vendor;
        }
        return '-' + vendor + '-';
    });
    var vendorStyles = function ($el, cssAttrs) {
        _(cssAttrs).each(function (value, attr) {
            var newAttrs = {};
            _(cssPrefixes).each(function (prefix) {
                newAttrs[prefix + attr] = value;
            });
            $el.css(newAttrs);
        });
    };

    // Base view. All views extend from this.
    var View = Backbone.View.extend({
        initialize: function (options) {
            this.views = {};
            this.options = options;
            var template = options && options.template || this.template;
            if (template) {
                this.template = _.template(template);
            }
            if (this.listen) {
                _(this.listen).each(this.delegateListener, this);
            }
            if (this.onReady) {
                this.on('ready', this.onReady);
            }
            if (this.onLoad) {
                this.on('load', this.onLoad);
            }
        },
        delegateListener: function (method, eventArgs) {
            if (!this[method]) {
                console.error("No method called '" + method + "' found.");
                return;
            }
            var args = eventArgs.split(' ');
            var event = args[0];
            var target = args[1] || this;
            this.listenTo(target, event, this[method]);
        },
        render: function () {
            if (this.template) {
                this.$el.html(this.template(this.getContext()));
            }
            this.trigger('ready');
            return this;
        },
        attachTo: function (target, method) {
            method = method || 'html';
            target[method](this.el);
            this.trigger('load');
            return this;
        },
        getContext: function () {
            return this.model ? this.model.toJSON() : {};
        },
        addView: function (view, name, method, options) {
            this.views[name] = new view(options).render().attachTo(this.$el, method);
        },
        remove: function () {
            Backbone.View.prototype.remove.apply(this, arguments);
            _(this.views).each(this.removeView);
        },
        removeView: function (view) {
            view.remove();
        }
    });

    // Character data. Controls the sets of characters and their selected state.
    var Character = Backbone.Model.extend({
        defaults: {
            initial: false,
            selected: false
        }
    });
    var CharacterSet = Backbone.Collection.extend({
        model: Character,
        initialize: function () {
            this.on('change:selected', function (model, selected) {
                // Save the selected model as an easily-accessible attribute,
                // and ensure only one is selected at a time.
                if (selected) {
                    if (this.selected && this.selected !== model) {
                        this.selected.set('selected', false);
                    }
                    this.selected = model;
                } else {
                    if (this.selected && this.selected === model) {
                        delete this.selected;
                    }
                }
            });
        },
        parse: function (chars) {
            if (_(chars).isString()) {
                // Parse a convenience string of characters.
                return _(chars).map(function (char, index) {
                    return {id: char, title: char, value: char, initial: index === 2};
                });
            }
            return chars;
        },
        getInitial: function () {
            return this.findWhere({initial: true});
        },
        setInitial: function () {
            this.getInitial().set('selected', true);
        },
        getSelected: function () {
            return this.selected;
        }
    });

    // Finger data. Controls the current selected character of a finger.
    var Finger = Backbone.Model.extend({
        defaults: {
            currentChar: ''
        },
        initialize: function (options) {
            if (options.charSet) {
                this.set('charSet', new CharacterSet(options.charSet, {parse: true}));
            }
        }
    });
    var FingerCollection = Backbone.Collection.extend({
        model: Finger,
        toJSON: function () {
            var models = Backbone.Collection.prototype.toJSON.apply(this, arguments);
            _(models).each(function (attrs) {
                if (attrs.charSet instanceof CharacterSet) {
                    attrs.charSet = attrs.charSet.toJSON();
                    _(attrs.charSet).each(function (char) {
                        // Remove selected attribute. It shouldn't be saved.
                        delete char.selected;
                    });
                }
            });
            return models;
        }
    });

    // Finger view. Positions itself, moves a pad along an axis, shows the
    // current character for selection, and returns that character on touchend.
    var FingerView = View.extend({
        className: 'finger',
        template:
            '<div class="slider">' +
                '<div class="pad js-touch-pad" data-finger-id="{{ id }}"></div>' +
            '</div>' +
            '<div class="char">{{ currentChar }}</div>',
        // Run when rendered.
        onReady: function () {
            this.$el.attr('id', this.model.id);
            // Convenience properties for easier access and one-time computation.
            this.chars = this.model.get('charSet');
            this.$slider = this.$('.slider');
            this.$pad = this.$('.pad');
            this.$char = this.$('.char');
            // Listen for character changes.
            this.listenTo(this.chars, 'change:selected', this.updateChar);
            this.listenTo(this.model, 'change:currentChar', this.renderChar);
            // Select the initial character.
            this.chars.setInitial();
            // Listen for customisation triggers.
            this.on('customise:start', this.customStart);
            this.on('customise:end', this.customEnd);
            this.on('customise:reset', this.customReset);
        },
        // Run when attached to the DOM.
        onLoad: function () {
            // Cache $ calls.
            this.padHeight = this.$pad.height();
            // Set the slider height based on number of characters in this set.
            var step = this.model.get('step');
            var charSetHeight = step * this.chars.length;
            this.$slider.height(charSetHeight);
            this.$el.height(charSetHeight);
            // Position the slider based on the initial character.
            this.initialTop = this.getTop(this.getInitial());
            this.reset();
            // Position the finger based on model data.
            this.$el.css('top', this.model.get('top'));
            this.$el.css('left', this.model.get('left'));
            vendorStyles(this.$el, {transform: 'rotate(' + this.model.get('angle') + 'deg)'});
            vendorStyles(this.$char, {transform: 'rotate(' + (this.model.get('angle') * -1) + 'deg)'});
            // Show all points of the characters.
            var showChar = $('<div>').addClass('char-position');
            this.chars.each(function (char, i) {
                var top = this.getTopFromIndex(i);
                this.$slider.append(showChar.clone().html(char.get('title')).css('top', top));
            }, this);
        },
        // Touch methods.
        touchstart: function (touch) {
            this.$el.addClass('hover');
            this.startX = touch.pageX;
            this.startY = touch.pageY;
            this.updateCoords(touch);
        },
        updateCoords: function (touch) {
            // Update position.
            this.pageX = touch.pageX;
            this.pageY = touch.pageY;
        },
        getVerticalDistance: function () {
            // Get current coordinates with starting coords as the origin: [0,0]
            var x = this.pageX - this.startX;
            var y = this.pageY - this.startY;
            // Get the angle of this finger in Radians.
            var angle = this.model.get('angle') * Math.PI / 180;
            // Mirror the angle to rotate the finger's local axes to match the
            // screen axes.
            angle *= -1;
            // Calculate the new coordinates of [x,y] in the new axes.
            var cosA = Math.cos(angle);
            var sinA = Math.sin(angle);
            var x1 = (x * cosA) - (y * sinA);
            var y1 = (y * cosA) + (x * sinA);
            // Return the vertical distance traveled.
            return y1;
        },
        touchmove: function (touch) {
            this.updateCoords(touch);
            // Get the straight-line distance between the coordinates.
            var verticalDistance = this.getVerticalDistance();
            // Increment/decrement distance and top value.
            this.top = this.initialTop + verticalDistance;
            // Move pad to new position.
            this.$pad.css('top', this.top);
            // If there's a new character to be selected, select it.
            var newChar = this.getCharFromTop(this.top);
            if (newChar !== this.getSelected()) {
                newChar.set('selected', true);
            }
        },
        touchend: function () {
            this.$el.removeClass('hover');
            this.trigger('select:char', this.getSelected().toJSON());
            this.reset();
        },
        reset: function () {
            var initial = this.getInitial();
            initial.set('selected', true);
            this.$pad.css('top', this.initialTop);
        },
        // Character methods.
        updateChar: function (model, selected) {
            if (selected) {
                this.model.set('currentChar', model.get('title'));
            }
        },
        renderChar: function (model, char) {
            this.$char.html(char);
        },
        getSelected: function () {
            return this.chars.getSelected();
        },
        getInitial: function () {
            return this.chars.getInitial();
        },
        getCharFromTop: function (top) {
            var step = this.model.get('step');
            top -= step / 2;
            var index = Math.round(top / step);
            if (index < 0) {
                return this.chars.first();
            }
            return this.chars.at(index) || this.chars.last();
        },
        getTop: function (char, noHalfStep) {
            var index = char.collection.indexOf(char);
            return this.getTopFromIndex(index);
        },
        getTopFromIndex: function (index) {
            var step = this.model.get('step');
            return step * index + step / 2;
        },
        customStart: function () {
            this.$el.addClass('edit');
        },
        customEnd: function () {
            this.$el.removeClass('edit');
        },
        customReset: function () {
            this.$el.removeClass('edit');
        }
    });

    var AppView = View.extend({
        el: '#app',
        template:
            '<div class="button-wrapper">' +
                '<div class="button reset js-hover js-reset">reset</div>' +
                '<div class="button position js-hover js-position">' +
                    '<span class="text-inactive">move/rotate</span>' +
                    '<span class="text-active">ok</span>' +
                '</div>' +
                '<div class="button peek js-hover js-peek">peek</div>' +
            '</div>' +
            '<div class="display">' +
                '<span class="content"></span>' +
                '<span class="cursor"></span>' +
            '</div>',
        events: {
            'touchmove': 'preventDefault',
            'touchstart .js-touch-pad': 'action',
            'touchmove .js-touch-pad': 'action',
            'touchend .js-touch-pad': 'action',
            'touchstart .js-hover': 'hoverStart',
            'touchend .js-hover': 'hoverEnd',
            'touchend .js-reset': 'reset',
            'touchend .js-position': 'position',
            'touchend .js-peek': 'toggleWorking'
        },
        listen: {
            'load': 'loadData',
            'save': 'saveData'
        },
        initialize: function () {
            View.prototype.initialize.apply(this, arguments);
            this.collection = new FingerCollection();
            this.trigger('load');
        },
        onReady: function () {
            this.$input = this.$('.display .content');
            this.$position = this.$('.position');
            this.fingers = [];
            this.collection.each(this.addFinger, this);
            this.trigger('save');
        },
        addFinger: function (finger) {
            this.addView(FingerView, finger.id, 'append', {model: finger});
            this.fingers.push(this.views[finger.id]);
            this.listenTo(this.views[finger.id], 'select:char', function (attrs) {
                // Get the current text.
                var input = this.$input.text();
                if (attrs.id === 'backspace') {
                    // Remove the last character.
                    this.$input.text(input.slice(0, -1));
                } else {
                    // Add the current character.
                    this.$input.text(input + attrs.value);
                }
            });
        },
        touchTracker: {},
        action: function (event) {
            this.preventDefault(event);
            var method = event.type;
            var touches = event.originalEvent.changedTouches;
            if (touches.length) {
                _(touches).each(function (touch) {
                    var finger = this.getFingerViewFromTouch(touch, method, event);
                    if (finger) {
                        // If a view is available, call the touch method on it.
                        finger[method].call(finger, touch);
                    }
                    if (method === 'touchend') {
                        // Delete this touch from the tracker as it ends.
                        delete this.touchTracker[touch.identifier];
                    }
                }, this);
            } else {
                // Reset the tracker when there aren't any touches.
                this.touchTracker = {};
            }
        },
        getFingerViewFromTouch: function (touch, type, event) {
            var fingerView;
            if (type === 'touchstart') {
                // Get the view of the finger we're touching.
                var $el = $(event.currentTarget);
                var fingerID = $el.data('finger-id');
                fingerView = this.views[fingerID];
                // Save it to the tracker so we don't have to find it again.
                this.touchTracker[touch.identifier] = fingerView;
            } else {
                // For all other touch events, get the view from the tracker.
                fingerView = this.touchTracker[touch.identifier];
            }
            return fingerView;
        },
        preventDefault: function (event) {
            event.preventDefault();
        },
        hoverStart: function (event) {
            $(event.currentTarget).addClass('hover');
        },
        hoverEnd: function (event) {
            $(event.currentTarget).removeClass('hover');
        },
        buttonActiveClass: 'active',
        reset: function (event) {
            this.preventDefault(event);
            this.hideWorking();
            this.$position.removeClass(this.buttonActiveClass);
            _(this.fingers).each(function (finger) {
                finger.trigger('customise:reset');
            });
        },
        position: function (event) {
            this.preventDefault(event);
            this.hideWorking();
            var trigger;
            if (this.$position.hasClass(this.buttonActiveClass)) {
                this.$position.removeClass(this.buttonActiveClass);
                trigger = 'end';
            } else {
                this.$position.addClass(this.buttonActiveClass);
                trigger = 'start';
            }
            _(this.fingers).each(function (finger) {
                finger.trigger('customise:' + trigger);
            });
        },
        peekClass: 'behind-the-scenes',
        toggleWorking: function (event) {
            if (this.$el.hasClass(this.peekClass)) {
                this.hideWorking();
            } else {
                this.showWorking();
            }
        },
        showWorking: function () {
            this.$el.addClass(this.peekClass);
        },
        hideWorking: function () {
            this.$el.removeClass(this.peekClass);
        },
        localStorageName: 'finger-data',
        loadData: function () {
            var data = this.loadFromStorage(this.localStorageName);
            if (data === null) {
                data = this.options.defaultData;
            }
            this.collection.reset(data);
        },
        saveData: function () {
            this.updateStorage(this.localStorageName, this.collection.toJSON());
        }
    });

    var Storage = {
        localStorageAppPrefix: 'enders-keyboard',
        updateStorage: function(name, data) {
            localStorage.setItem(this.localStorageAppPrefix + '-' + name, JSON.stringify(data));
        },
        loadFromStorage: function(name) {
            return JSON.parse(localStorage.getItem(this.localStorageAppPrefix + '-' + name));
        }
    };

    _.extend(AppView.prototype, Storage);

    // Setup the default finger data.
    var defaultStep = 40;
    var defaultData = [
        {
            id: 'thumb',
            step: defaultStep,
            charSet: [
                {id: 'return', title: '&crarr;', value: '\n'},
                {id: 'space', title: '&rarr;', value: ' ', initial: true},
                {id: 'backspace', title: '&larr;', value: null}
            ],
            angle: -60,
            top: 400,
            left: 110
        },
        {
            id: 'second',
            step: defaultStep,
            charSet: 'abcdefg',
            angle: -10,
            top: 220,
            left: 270
        },
        {
            id: 'third',
            step: defaultStep,
            charSet: 'hijklmn',
            angle: 0,
            top: 200,
            left: 410
        },
        {
            id: 'fourth',
            step: defaultStep,
            charSet: 'opqrst',
            angle: 5,
            top: 200,
            left: 550
        },
        {
            id: 'fifth',
            step: defaultStep,
            charSet: 'uvwxyz',
            angle: 30,
            top: 270,
            left: 680
        }
    ];

    $(function () {
        // When the DOM is ready, run the app.
        var app = new AppView({
            defaultData: defaultData
        }).render();
    });

})(window._, window.$, window.Backbone);
