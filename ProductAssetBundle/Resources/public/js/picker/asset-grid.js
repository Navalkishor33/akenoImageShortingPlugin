﻿'use strict';

define(
    [
        'jquery',
        'underscore',
        'backbone',
        'routing',
        'pim/form',
        'text!pimee/template/picker/asset-grid',
        'text!pimee/template/picker/basket',
        'oro/datagrid-builder',
        'oro/mediator',
        'pim/fetcher-registry',
        'pim/user-context',
        'oro/datafilter/product_category-filter'
    ],
    function (
        $,
        _,
        Backbone,
        Routing,
        BaseForm,
        template,
        basketTemplate,
        datagridBuilder,
        mediator,
        FetcherRegistry,
        UserContext,
        CategoryFilter
    ) {
        return BaseForm.extend({
            template: _.template(template),
            basketTemplate: _.template(basketTemplate),
            events: {
                'click .remove-asset': 'removeAssetFromBasket'
            },

            /**
             * {@inheritdoc}
             */
            initialize: function () {
                this.datagridModel = null;

                BaseForm.prototype.initialize.apply(this, arguments);
            },

            /**
             * {@inheritdoc}
             */
            configure: function () {
                this.datagrid = {
                    name: 'asset-picker-grid',
                    paramName: 'assetCodes'
                };

                mediator.on('datagrid:selectModel:' + this.datagrid.name, this.selectModel.bind(this));
                mediator.on('datagrid:unselectModel:' + this.datagrid.name, this.unselectModel.bind(this));
                mediator.on('datagrid_collection_set_after', this.updateChecked.bind(this));
                mediator.on('datagrid_collection_set_after', this.setDatagrid.bind(this));
                mediator.on('grid_load:complete', this.updateChecked.bind(this));
                mediator.once('column_form_listener:initialized', function onColumnListenerReady(gridName) {
                    if (!this.configured) {
                        mediator.trigger(
                            'column_form_listener:set_selectors:' + gridName,
                            { included: '#asset-appendfield' }
                        );
                    }
                }.bind(this));

                return BaseForm.prototype.configure.apply(this, arguments);
            },

            /**
             * {@inheritdoc}
             */
            render: function () {
                if (!this.configured) {
                    return this;
                }

                this.$el.html(this.template({
                    locale: this.getLocale()
                }));
                this.renderGrid(this.datagrid);

                return this.renderExtensions();
            },

            /**
             * Render the asset grid
             */
            renderGrid: function () {
                var urlParams = {
                    alias: this.datagrid.name,
                    params: {
                        dataLocale: this.getLocale(),
                        _filter: {
                            category: { value: { categoryId: -2 }}, // -2 = all categories
                            scope: { value: this.getScope() }
                        }
                    }
                };

                /* jshint nonew: false */
                new CategoryFilter(urlParams, 'asset-grid', 'pimee_asset_picker_categorytree', '#asset-tree');

                $.get(Routing.generate('pim_datagrid_load', urlParams)).done(function (response) {
                    this.$('#grid-' + this.datagrid.name).data(
                        { 'metadata': response.metadata, 'data': JSON.parse(response.data) }
                    );

                    require(response.metadata.requireJSModules, function () {
                        datagridBuilder(_.toArray(arguments));
                    });

                }.bind(this));
            },

            /**
             * Triggered by the event 'datagrid_collection_set_after' to keep a locale reference to
             * the grid model #gridCrap
             *
             * @param {Object} datagridModel
             */
            setDatagrid: function (datagridModel) {
                this.datagridModel = datagridModel;
            },

            /**
             * Triggered by the datagrid:selectModel:asset-picker-grid event
             *
             * @param {Object} model
             */
            selectModel: function (model) {
                this.addAsset(model.get('code'));
            },

            /**
             * Triggered by the datagrid:unselectModel:asset-picker-grid event
             *
             * @param {Object} model
             */
            unselectModel: function (model) {
                this.removeAsset(model.get('code'));
            },

            /**
             * Add an asset to the basket
             *
             * @param {string} code
             *
             * @return this
             */
            addAsset: function (code) {
                var assets = this.getAssets();
                assets.push(code);
                assets = _.uniq(assets);

                this.setAssets(assets);

                return this;
            },

            /**
             * Remove an asset from the collection
             *
             * @param {string} code
             *
             * @return this
             */
            removeAsset: function (code) {
                var assets = _.without(this.getAssets(), code);

                this.setAssets(assets);

                return this;
            },

            /**
             * Get all assets in the collection
             *
             * @return {Array}
             */
            getAssets: function () {
                var assets = $('#asset-appendfield').val();

                return (!_.isUndefined(assets) && '' !== assets) ? assets.split(',') : [];
            },

            /**
             * Set assets
             *
             * @param {Array} assetCodes
             *
             * @return this
             */
            setAssets: function (assetCodes) {
                $('#asset-appendfield').val(assetCodes.join(','));
                this.updateBasket();

                return this;
            },

            /**
             * Update the checked rows in the grid according to the current model
             *
             * @param {Object} datagrid
             */
            updateChecked: function (datagrid) {
                if (datagrid.inputName !== this.datagrid.name) {
                    return;
                }

                var assets = this.getAssets();

                _.each(datagrid.models, function (row) {
                    if (_.contains(assets, row.get('code'))) {
                        row.set('is_checked', true);
                    } else {
                        row.set('is_checked', null);
                    }
                }.bind(this));
		
                this.setAssets(assets);
            },

            /**
             * Remove an asset from the basket (triggered by 'click .remove-asset')
             *
             * @param {Event} event
             */
            removeAssetFromBasket: function (event) {
                this.removeAsset(event.currentTarget.dataset.asset);
                if (this.datagridModel) {
                    this.updateChecked(this.datagridModel);
                }
            },

            /**
             * Render the basket to update its content
             */
            updateBasket: function () {

                FetcherRegistry.getFetcher('asset').fetchByIdentifiers(this.getAssets())
                    .then(function (assets) {
                        this.$('.basket').html(this.basketTemplate({
                            assets: assets,
                            thumbnailFilter: 'thumbnail',
                            scope: this.getScope(),
                            locale: this.getLocale()
                        }));

                        this.delegateEvents();
				if(assets.length>1)
				{
				/*  Creating Dragable items */
					$(".basket-inner ul li").each(function () {
					    if ($(this).attr("draggable") != "true") {
						$(this).attr("draggable","true");
						$(this).attr('ondragenter','dragenter(event)');
						$(this).attr('ondragstart','dragstart(event)');				
					    }
					})
				}
				
                    }.bind(this));
            },

            /**
             * Get the current locale
             *
             * @return {string}
             */
            getLocale: function () {
                return UserContext.get('catalogLocale');
            },

            /**
             * Get the current scope
             *
             * @return {string}
             */
            getScope: function () {
                return UserContext.get('catalogScope');
            }
        });
    }
);

/***********Drag And Drop Code Start Here */
var source;
function isbefore(a, b) {
    if (a.parentNode == b.parentNode) {
        for (var cur = a; cur; cur = cur.previousSibling) {
            if (cur === b) { 
                return 1;
            }
        }
    }
    else if(a.parentNode == b.parentNode.parentNode){
         for (var cur = a; cur; cur = cur.previousSibling) {
            if (cur === b.parentNode) { 
                return 2;
            }
        }

    }
    return 0;
} 

function dragenter(e) {
    if (isbefore(source, e.target)==1) {
        e.target.parentNode.insertBefore(source, e.target);
       basketAssetsNewOrder();
    }
    else if(isbefore(source, e.target)==0) {
        e.target.parentNode.insertBefore(source, e.target.nextSibling);
        basketAssetsNewOrder();
    }
}

function dragstart(e) {
    source = e.target;
    e.dataTransfer.effectAllowed = 'move';
}

function basketAssetsNewOrder()
{
        var newAssetsOrder = "";
        $(".basket-inner ul li").each(function () {
            if(newAssetsOrder==""){
                newAssetsOrder = $(this).attr("data-asset");
            }
            else{
                newAssetsOrder = newAssetsOrder+","+$(this).attr("data-asset");
            }
        });
        $('#asset-appendfield').val(newAssetsOrder);
}
/***********Drag And Drop Code Start Here */


