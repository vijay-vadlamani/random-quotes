/**
 * @module src/app
 */
import MotherComponent from '../MotherComponent/MotherComponent.js';

import template from './Home.html!text';
// import stylesheet from './Home.scss!';

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
     * @namespace Components.Home
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

        let geolocationInfosBloc = this.domNode.querySelector('.geolocation-infos');

        this.domNode.querySelector('.geolocation-button').addEventListener('click', () => {
            geolocationInfosBloc.style.display = "none";
            geolocation()
                .then((result) => {
                    console.log(result);
                    let tpl = `
          <li>City: ${result.city}</li>
          <li>Country: ${result.country_name}</li>
          <li>Region: ${result.region_name}</li>
          <li>Time zone: ${result.time_zone}</li>
          <li>Region: ${result.region_name}</li>
          <li>Latitude : ${result.latitude} / Longitude: ${result.longitude}</li>
          <li>Timeout : ${result.timeout}ms</li>
        `;
                    geolocationInfosBloc.style.display = "block";
                    geolocationInfosBloc.innerHTML = tpl;
                })
                .catch(e => {
                    console.error(e);
                    geolocationInfosBloc.innerHTML = '<li>An error occured</li>';
                    geolocationInfosBloc.style.display = "block";
                });
        }, false);
        return this;
    }
}