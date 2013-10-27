$(function () {
    _.templateSettings.evaluate = /\{%([\s\S]+?)%\}/g;
    _.templateSettings.interpolate = /\{\{([\s\S]+?)\}\}/g;

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
        setInitial: function () {
            this.findWhere({initial: true}).set('selected', true);
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
        events: {
            'touchstart': 'action',
            'touchmove': 'action',
            'touchend': 'action'
        },
        template: '<div class="char">{{ currentChar }}</div>',
        onReady: function () {
            this.$el.addClass(this.model.id);
            this.$char = this.$('.char');
            this.chars = this.model.get('charSet');
            this.listenTo(this.chars, 'change:selected', this.updateChar);
            this.listenTo(this.model, 'change:currentChar', this.renderChar);
            this.chars.setInitial();
        },
        action: function (event) {
            event.preventDefault();
            var method = event.type.replace('touch', '');
            var touches = event.touches || event.originalEvent.touches;
            if (touches.length) {
                _(touches).each(this[method], this);
            } else {
                this[method]();
            }
        },
        start: function (touch) {
            this.pageY = touch.pageY;
            this.top = this.getTop(this.getInitial());
            this.updateCoords(touch);
        },
        updateCoords: function (touch) {
            var oldY = this.pageY;
            this.pageY = touch.pageY;
            this.distY = this.pageY - oldY;
            this.top += this.distY;
            this.getCharFromTop(this.top).set('selected', true);
        },
        updateChar: function (model, selected) {
            if (selected) {
                this.model.set('currentChar', model.get('title'));
            }
        },
        renderChar: function (model, char) {
            this.$char.html(char);
        },
        move: function (touch) {
            this.updateCoords(touch);
        },
        end: function () {
            this.trigger('select:char', this.getSelected().toJSON());
            this.reset();
        },
        reset: function () {
            var initial = this.getInitial();
            initial.set('selected', true);
        },
        getSelected: function () {
            return this.chars.selected;
        },
        getInitial: function () {
            return this.chars.findWhere({initial: true});
        },
        getCharFromTop: function (top) {
            var step = this.model.get('step');
            top += step / 2;
            if (top < step) {
                return this.chars.first();
            }
            var index = Math.floor(top / step);
            return this.chars.at(index) || this.chars.last();
        },
        getTop: function (char) {
            return this.model.get('step') * char.collection.indexOf(char);
        }
    });

    var fingers = [
        {
            id: 'thumb',
            step: 20,
            charSet: [
                {id: 'return', title: '&crarr;', value: '\n'},
                {id: 'space', title: '&rarr;', value: ' ', initial: true},
                {id: 'backspace', title: '&larr;', value: null}
            ]
        },
        {
            id: 'second',
            step: 20,
            charSet: 'abcdefg'
        },
        {
            id: 'third',
            step: 20,
            charSet: 'hijklmn'
        },
        {
            id: 'fourth',
            step: 20,
            charSet: 'opqrst'
        },
        {
            id: 'fifth',
            step: 20,
            charSet: 'uvwxyz'
        }
    ];

    var AppView = View.extend({
        el: '#app',
        template: '<textarea class="input"></textarea>',
        onReady: function () {
            this.$input = this.$('.input');
            _(fingers).each(this.addFinger, this);
        },
        addFinger: function (finger) {
            this.addView(FingerView, finger.id, 'append', {model: new Finger(finger)});
            this.listenTo(this.views[finger.id], 'select:char', function (attrs) {
                var currentVal = this.$input.val();
                if (attrs.id === 'backspace') {
                    this.$input.val(currentVal.slice(0, -1));
                } else {
                    var char = attrs.title || attrs.value;
                    this.$input.val(currentVal + char);
                }
            });
        }
    });

    var app = new AppView().render();
});
