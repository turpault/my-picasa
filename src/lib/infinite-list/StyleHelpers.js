
var applyElementStyle = function (element, styleObj) {
        Object.keys(styleObj).forEach(function (key) {
            if (element.style[key] != styleObj[key]) {
                element.style[key] = styleObj[key];
            }
        })
    },

    applyTransformStyle = function(element, transformValue){
        var styleObject = {};
        ['webkit', 'Moz', 'O', 'ms'].forEach(function(prefix){
                styleObject[prefix + 'Transform'] = transformValue;
            }
        );
        applyElementStyle(element, styleObject);
};

export default {
    applyElementStyle: applyElementStyle,
    applyTransformStyle: applyTransformStyle
};
