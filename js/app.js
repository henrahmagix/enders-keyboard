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
                    return {
                        id: char,
                        value: char,
                        initial: index === 2
                    };
                });
            }
            return chars;
        },
        setInitial: function () {
            this.findWhere({initial: true}).set('selected', true);
        }
    });

    var CharacterView = View.extend({
        className: 'char',
        template: '{{ value }}',
        initialize: function () {
            View.prototype.initialize.apply(this, arguments);
            this.listenTo(this.model, 'change', this.render);
        },
        onReady: function () {
            if (this.model.get('initial')) {
                this.$el.addClass('initial');
            }
            if (this.model.get('selected')) {
                this.$el.addClass('selected');
            }
        }
    });

    // var SliderView = View.extend({
    //     className: 'slider',
    //     events: {
    //     },
    //     initialize: function (collection) {
    //         View.prototype.initialize.apply(this, arguments);
    //         this.collection = collection;
    //         this.collection.each(this.addChar, this);
    //         this.listenTo(this.collection, 'change:selected', function (model, selected, collection) {
    //             if (selected) {
    //                 if (collection.selected && collection.selected !== model) {
    //                     collection.selected.set('selected', false);
    //                 }
    //                 collection.selected = model;
    //             } else {
    //                 if (collection.selected && collection.selected === model) {
    //                     delete collection.selected;
    //                 }
    //             }
    //         });
    //     },
    //     addChar: function (char) {
    //         this.addView(CharacterView, char.id, 'append', {model: char});
    //     }
    // });

    var Finger = Backbone.Model.extend({
        defaults: {
            char: ''
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
        template: '<div class="char">{{ char }}</div>',
        onReady: function () {
            this.$el.addClass(this.model.id);
            // this.addView(SliderView, 'slider', 'append', this.model.get('charSet'));
            // this.$slider = this.views.slider.$el;
            // this.$slider.hide();
            this.$char = this.$('.char');
            this.chars = this.model.get('charSet');
            this.listenTo(this.chars, 'change:selected', this.updateChar);
            this.listenTo(this.model, 'change:char', this.renderChar);
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
            this.distY = oldY - this.pageY;
            this.top += this.distY;
            this.getCharFromTop(this.top).set('selected', true);
        },
        updateChar: function (model, selected) {
            if (selected) {
                this.model.set('char', model.get('value'));
            }
        },
        renderChar: function (model, char) {
            this.$char.html(char);
        },
        move: function (touch) {
            this.updateCoords(touch);
        },
        end: function () {
            this.trigger('char:select', this.chars.selected.toJSON());
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
                {id: 'return', value: '&crarr;', char: '\n'},
                {id: 'space', value: '&rarr;', char: ' ', initial: true},
                {id: 'backspace', value: '&larr;'},
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
        onReady: function () {
            _(fingers).each(this.addFinger, this);
            this.$el.append('<textarea class="input"></textarea>');
            this.$input = this.$('.input');
        },
        addFinger: function (finger) {
            this.addView(FingerView, finger.id, 'append', {model: new Finger(finger)});
            this.listenTo(this.views[finger.id], 'char:select', function (model) {
                var currentVal = this.$input.val();
                if (model.id === 'backspace') {
                    this.$input.val(currentVal.slice(0, -1));
                } else {
                    var char = model.char || model.value;
                    this.$input.val(currentVal + char);
                }
            });
        }
    });

    var app = new AppView().render();
});
