$(function () {
    _.templateSettings.evaluate = /\{%([\s\S]+?)%\}/g;
    _.templateSettings.interpolate = /\{\{([\s\S]+?)\}\}/g;

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

    var View = Backbone.View.extend({
        initialize: function (options) {
            this.views = {};
            var template = options && options.template || this.template;
            if (template) {
                this.template = _.template(template);
            }
            if (this.onReady) {
                this.on('ready', this.onReady);
            }
            if (this.onLoad) {
                this.on('load', this.onLoad);
            }
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

    var FingerView = View.extend({
        className: 'finger',
        template: '<div class="slider"><div class="pad js-touch-capture" data-finger-id="{{ id }}"></div></div><div class="char">{{ currentChar }}</div>',
        onReady: function () {
            this.$el.attr('id', this.model.id);
            this.chars = this.model.get('charSet');
            this.$char = this.$('.char');
            this.$slider = this.$('.slider');
            this.$pad = this.$('.pad');
            this.listenTo(this.chars, 'change:selected', this.updateChar);
            this.listenTo(this.model, 'change:currentChar', this.renderChar);
            this.chars.setInitial();
        },
        onLoad: function () {
            this.height = this.$el.height();
            this.width = this.$el.width();
            var charSetHeight = this.model.get('step') * this.chars.length + this.height;
            this.$slider.height(charSetHeight);
            this.$el.height(charSetHeight);
            this.padHeight = this.$pad.height();
            this.$slider.css('top', this.getTop(this.getInitial()) * -1 + this.model.get('step') / 2);
            this.$el.css('top', this.model.get('top'));
            this.$el.css('left', this.model.get('left'));
            vendorStyles(this.$el, {transform: 'rotate(' + this.model.get('angle') + 'deg)'});
            vendorStyles(this.$char, {transform: 'rotate(' + (this.model.get('angle') * -1) + 'deg)'});
        },
        touchstart: function (touch) {
            this.$el.addClass('hover');
            this.startY = touch.pageY;
            this.pageY = this.startY;
            this.top = this.getTop(this.getInitial());
            this.updateCoords(touch);
        },
        updateCoords: function (touch) {
            var oldY = this.pageY;
            this.pageY = touch.pageY;
            this.distY = this.pageY - oldY;
            this.top += this.distY;
            this.$pad.css('top', this.pageY - this.startY);
            var newChar = this.getCharFromTop(this.top);
            if (newChar !== this.getSelected()) {
                newChar.set('selected', true);
            }
        },
        updateChar: function (model, selected) {
            if (selected) {
                this.model.set('currentChar', model.get('title'));
            }
        },
        renderChar: function (model, char) {
            this.$char.html(char);
        },
        touchmove: function (touch) {
            this.updateCoords(touch);
        },
        touchend: function () {
            this.$el.removeClass('hover');
            this.trigger('select:char', this.getSelected().toJSON());
            this.reset();
        },
        reset: function () {
            var initial = this.getInitial();
            initial.set('selected', true);
            this.$pad.css('top', 0);
        },
        getSelected: function () {
            return this.chars.getSelected();
        },
        getInitial: function () {
            return this.chars.getInitial();
        },
        getCharFromTop: function (top) {
            var step = this.model.get('step');
            if (top < step) {
                return this.chars.first();
            }
            var index = Math.floor(top / step);
            return this.chars.at(index) || this.chars.last();
        },
        getTop: function (char) {
            var step = this.model.get('step');
            return step * char.collection.indexOf(char) + step / 2;
        }
    });

    var AppView = View.extend({
        el: '#app',
        template: '<div class="display"><span class="content">&nbsp;</span><span class="cursor">|</span></div>',
        events: {
            'touchmove': 'preventDefault',
            'touchstart .js-touch-capture': 'action',
            'touchmove .js-touch-capture': 'action',
            'touchend .js-touch-capture': 'action'
        },
        initialize: function (options) {
            View.prototype.initialize.apply(this, arguments);
            _.extend(this, options);
        },
        onReady: function () {
            this.$input = this.$('.display .content');
            _(this.fingers).each(this.addFinger, this);
        },
        addFinger: function (finger) {
            this.addView(FingerView, finger.id, 'append', {model: new Finger(finger)});
            this.listenTo(this.views[finger.id], 'select:char', function (attrs) {
                var input = this.$input.html();
                if (attrs.id === 'backspace') {
                    this.$input.html(input.slice(0, -1));
                } else {
                    var char = attrs.value;
                    this.$input.html(input + char);
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
                        finger[method].call(finger, touch);
                    }
                    if (method === 'touchend') {
                        delete this.touchTracker[touch.identifier];
                    }
                }, this);
            } else {
                this.touchTracker = {};
            }
        },
        getFingerViewFromTouch: function (touch, type, event) {
            var fingerView;
            if (type === 'touchstart') {
                var $el = $(event.currentTarget);
                var fingerID = $el.data('finger-id');
                fingerView = this.views[fingerID];
                this.touchTracker[touch.identifier] = fingerView;
            } else {
                fingerView = this.touchTracker[touch.identifier];
            }
            return fingerView;
        },
        preventDefault: function (event) {
            event.preventDefault();
        }
    });

    var defaultStep = 40;

    var fingers = [
        {
            id: 'thumb',
            step: defaultStep,
            charSet: [
                {id: 'return', title: '&crarr;', value: '<br> '},
                {id: 'space', title: '&rarr;', value: ' ', initial: true},
                {id: 'backspace', title: '&larr;', value: null}
            ],
            angle: -60,
            top: 340,
            left: 110
        },
        {
            id: 'second',
            step: defaultStep,
            charSet: 'abcdefg',
            angle: -10,
            top: 160,
            left: 270
        },
        {
            id: 'third',
            step: defaultStep,
            charSet: 'hijklmn',
            angle: 0,
            top: 140,
            left: 410
        },
        {
            id: 'fourth',
            step: defaultStep,
            charSet: 'opqrst',
            angle: 5,
            top: 140,
            left: 550
        },
        {
            id: 'fifth',
            step: defaultStep,
            charSet: 'uvwxyz',
            angle: 30,
            top: 210,
            left: 680
        }
    ];

    var app = new AppView({fingers: fingers}).render();
});
