/**
 * @module src/app
 */
import MotherComponent from '../MotherComponent/MotherComponent.js';

import template from './Home.html!text';
import stylesheet from './Home.css!';

import {geolocation} from '../../Services/geolocation.js';

export default class Home extends MotherComponent {
    /**
     * Creates a full Home component with its whole logic encapsulated:
     *
     * * display of the result
     *
     * Example:
     *
     * ```
     * var myHome = (new Home('home')).init();
     * ```
     * @namespace Components.Home.Home
     * @class Home
     * @extends Components.MotherComponent.MotherComponent
     * @constructor
     * @param {HTMLElement|String} domNode Can be an domNode or a domNode id
     */
    constructor(domNode) {
        super(domNode, template);
    }

    /**
     * Inits the Home component, adding all its specific logic.
     * @method init
     * @chainable
     * @return {Components.Home.Home}
     */
    init() {

        let randomQuoteGenerate = this.domNode.querySelector('.randomQuoteGenerate');

        randomQuoteGenerate.addEventListener('click', function() {
                let
                    url= `https://talaikis.com/api/quotes/random/`;
                fetch(url, {
                    method: 'GET'
                }).then(res => res.json())
                    .catch(error => console.error('Error:', error))
                    .then((response) => {
                        document.getElementById('quote').innerHTML = response.quote;
                        document.getElementById('author').innerHTML = '-' + response.author;
                    });
            });
    };
};