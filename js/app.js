$(function () {
    var $fingers = $('.finger');
    $fingers.each(function () {
        var $slider = $(this).find('.slider');
        var $chars = $slider.find('.char');
        var defaultLetter = $chars.filter('.default');
        $slider.css('top', defaultLetter.position().top * -1);
    });
});
