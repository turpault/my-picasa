import StyleHelpers from './StyleHelpers.js';

const LayersPool = function () {
    var layersByIdentifier = {};

    function addLayer(layer, hide) {
        var layerIdentifier = layer.getIdentifier();
        if (layersByIdentifier[layerIdentifier] == null) {
            layersByIdentifier[layerIdentifier] = [];
        }
        layersByIdentifier[layerIdentifier].push(layer);
        layer.setItemOffset(-10000);
        StyleHelpers.applyElementStyle(layer.getDomElement(), {display: 'none'});
        if (hide){
            StyleHelpers.applyElementStyle(layer.getDomElement(), {display: 'none'})
        }
    }

    function borrowLayerWithIdentifier(identifier) {
        if (layersByIdentifier[identifier] == null) {
            return null;
        }
        var layer = layersByIdentifier[identifier].pop();
        if (layer != null) {
            StyleHelpers.applyElementStyle(layer.getDomElement(), {display: 'block'})
        }
        return layer;
    }

    return {
        addLayer: addLayer,
        borrowLayerWithIdentifier: borrowLayerWithIdentifier
    }
}

export default LayersPool;
