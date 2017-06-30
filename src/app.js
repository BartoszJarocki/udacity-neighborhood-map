import _ from 'lodash';
import ko from 'knockout';
import axios from 'axios';


var RestaurantInfoViewModel = function (data) {
  var self = this;

  self.id = data.id;
  self.name = data.name;
  self.address = data.address;
  self.toggled = ko.observable(data.toggled);
  self.showing = ko.observable(data.showing);
  self.location = data.location;
};

function AppViewModel() {
  let self = this;

  this.place = ko.observable('');

  this.search = function () {
    console.log(self.place());
  }
}

/**
 * Maps related functions
 */

window.getLocation = getLocation;

var map;
var infowindow;

function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showMapForPosition);
  } else {
    // Constructor creates a new map - only center and zoom are required.
    map = new google.maps.Map(document.getElementById('map'), {
      center: {lat: 40.7413549, lng: -73.9980244},
      zoom: 13
    });
  }
}

function showMapForPosition(position) {
  var userLocation = {lat: position.coords.latitude, lng: position.coords.longitude};

  map = new google.maps.Map(document.getElementById('map'), {
    center: userLocation,
    zoom: 15
  });

  var service = new google.maps.places.PlacesService(map);
  service.nearbySearch({
    location: userLocation,
    radius: 2000,
    type: ['restaurant']
  }, callback);
}

function callback(results, status) {
  if (status === google.maps.places.PlacesServiceStatus.OK) {
    for (var i = 0; i < results.length; i++) {
      createMarker(results[i]);
    }
  }
}

function createMarker(place) {
  var placeLoc = place.geometry.location;
  var marker = new google.maps.Marker({
    map: map,
    position: place.geometry.location
  });

  google.maps.event.addListener(marker, 'click', function () {
    var infowindow = new google.maps.InfoWindow({
      content: place.name
    });
    infowindow.open(map, this);
  });
}

ko.applyBindings(new AppViewModel());