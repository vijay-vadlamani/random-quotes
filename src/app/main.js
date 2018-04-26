/**
 * @module src/app
 */

import Home from './Components/Home/Home.js';
/**
 * This class is called by the app entry point.
 * It holds the logic initiation.
 * @class main
 */
export default class main {
    /**
     * Inits the whole logic of the app
     * @method init
     * @static
     */
    static init() {
        this.initHome();
    }

    /**
     * Inits the {{#crossLink "Components.Home.Home"}}Home{{/crossLink}} component
     * @method initHome
     * @static
     */

    static initHome() {
        (new Home('content')).init();
    }
}