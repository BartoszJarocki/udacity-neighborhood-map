import _ from 'lodash';
import ko from 'knockout';

function AppViewModel() {
  let self = this;

  this.place = ko.observable("");

  this.search = function() {
    console.log(self.place());
  }
}

/**
 * Maps related functions
 */

window.initMap = initMap;

var map;
function initMap() {
  // Constructor creates a new map - only center and zoom are required.
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: 40.7413549, lng: -73.9980244},
    zoom: 13
  });
}

ko.applyBindings(new AppViewModel());