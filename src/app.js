import _ from 'lodash';
import ko from 'knockout';
import axios from 'axios';

const NO_SELECTION = {id: -1};

const FOURSQUARE_CLIENT_ID = '1LYQZGNJY5LEMM43JY3U11X12JQSBNLTFAIHFLJYECGP2EMX';
const FOURSQUARE_CLIENT_SECRET = '31SPAFT0LCOGKLSQUNJU1H3BZVP4PW0DGDCKN41ELLENWK1W';
const FOURSQUARE_DATE_VERSION = '20170701';

let restaurants = [];
let markers = [];

let RestaurantInfo = function (data) {
  let self = this;

  self.id = data.place_id;
  self.name = data.name;
  self.address = data.vicinity;
  self.location = {lat: data.geometry.location.lat(), lng: data.geometry.location.lng()};
  self.photos = data.photos;
};

function RestaurantsViewModel() {
  let self = this;

  self.restaurants = ko.observableArray(
    _.chain(restaurants)
      .map(restaurant => new RestaurantInfo(restaurant))
      .value()
  );

  self.selectedRestaurant = ko.observable(NO_SELECTION);

  self.restaurantClicked = function (restaurant) {
    console.log(restaurant);

    self.selectedRestaurant(restaurant);
    selectMarker(restaurant.id);
    fetchDetails(restaurant);
  };

  self.filterQuery = ko.observable('');

  self.filterRestaurants = function () {
    self.selectedRestaurant(NO_SELECTION);

    if (_.isEmpty(self.filterQuery())) {
      self.restaurants(restaurants);
      filterMarkers();
      centerMap();
      return;
    }

    self.restaurants(
      _.chain(self.restaurants())
        .filter(restaurant => restaurant.name.toLowerCase().indexOf(self.filterQuery().toLowerCase()) > -1)
        .value()
    );
    filterMarkers();
    centerMap();
  };

  self.filterMode = ko.computed(function () {
    return !_.isEmpty(self.filterQuery());
  });

  self.resetFilter = function () {
    self.filterQuery('');
    self.filterRestaurants()
  };

  self.restaurantDetails = ko.observable({});
  self.restaurantDetailsError = ko.observable('');
  self.showRestaurantDetailsProgress = ko.observable(false);
  self.showRestaurantDetailsError = ko.observable(false);
  self.showRestaurantDetailsEmpty = ko.observable(false);
  self.showRestaurantDetails = ko.computed(function () {
    return !self.showRestaurantDetailsProgress() && !self.showRestaurantDetailsError() && !self.showRestaurantDetailsEmpty();
  }, this);
}

/**
 * Apply knockout bindings
 */
let viewModel = new RestaurantsViewModel();
ko.applyBindings(viewModel);

/**
 * Maps related functions
 */

window.getLocation = getLocation;

let map;
let infoWindow;
let placesService;

function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showMapForPosition);
  } else {
    // use some default place
    map = new google.maps.Map(document.getElementById('map'), {
      center: {lat: 40.7413549, lng: -73.9980244},
      zoom: 13
    });
  }
}

function searchRestaurantsByLocation(location) {
  placesService.nearbySearch({
    location: new google.maps.LatLng(location.lat, location.lng),
    radius: 5000,
    type: ['restaurant']
  }, onSearchResults);
}

function searchRestaurantsByBounds() {
  placesService.nearbySearch({
    bounds: map.getBounds(),
    radius: 5000,
    type: ['restaurant']
  }, onSearchResults);
}

function onSearchResults(results, status) {
  viewModel.selectedRestaurant(NO_SELECTION);

  if (status === google.maps.places.PlacesServiceStatus.OK) {
    clearMarkers();
    restaurants = [];

    for (var i = 0; i < results.length; i++) {
      restaurants.push(new RestaurantInfo(results[i]));
      markers.push(createMarker(results[i]));
    }
  }

  viewModel.restaurants(restaurants);
}

function showMapForPosition(position) {
  let userLocation = {lat: position.coords.latitude, lng: position.coords.longitude};

  map = new google.maps.Map(document.getElementById('map'), {
    center: userLocation,
    zoom: 13,
    gestureHandling: 'cooperative'
  });
  map.addListener('dragend', function () {
    if (!viewModel.filterMode()) {
      searchRestaurantsByBounds();
    }
  });

  placesService = new google.maps.places.PlacesService(map);
  searchRestaurantsByLocation(userLocation);
}

function centerMap() {
  const visibleMarkers = _.filter(markers, (marker) => marker.visible);
  let bounds = new google.maps.LatLngBounds();
  _.each(visibleMarkers, marker => {
    if (marker.visible) {
      marker.setMap(map);
      bounds.extend(marker.position)
    }
  });
  map.fitBounds(bounds);
}

function createMarker(place) {
  let marker = new google.maps.Marker({
    id: place.place_id,
    map: map,
    position: place.geometry.location,
    animation: google.maps.Animation.DROP,
  });

  google.maps.event.addListener(marker, 'click', function () {
    map.panTo(marker.getPosition());
    animateMarker(marker);

    if (infoWindow) {
      infoWindow.close();
    }

    let restaurant = _.find(restaurants, {id: marker.id});
    viewModel.selectedRestaurant(restaurant);
    fetchDetails(restaurant);

    infoWindow = new google.maps.InfoWindow({
      content: place.name
    });
    infoWindow.open(map, this);
    infoWindow.addListener('closeclick', function () {
      viewModel.selectedRestaurant(NO_SELECTION);
      infoWindow.close();
    });
  });

  return marker;
}

function selectMarker(id) {
  _.chain(markers)
    .filter((marker) => marker.id === id)
    .each((marker) => {
      new google.maps.event.trigger(marker, 'click');
    })
    .value();
}

function animateMarker(marker) {
  marker.setAnimation(google.maps.Animation.BOUNCE);
  _.delay(function removeAnimation() {
    marker.setAnimation(null);
  }, 700);
}

function clearMarkers() {
  _.each(markers, (marker) => {
    marker.setMap(null);
  });
  markers = [];
}

function filterMarkers() {
  _.chain(markers)
    .each(marker => marker.setVisible(false))
    .filter(marker => _.includes(_.map(viewModel.restaurants(), restaurant => restaurant.id), marker.id))
    .each(marker => marker.setVisible(true))
    .value();

  if (infoWindow) {
    infoWindow.close();
  }
}

function fetchDetails(restaurant) {
  viewModel.restaurantDetails({});
  viewModel.showRestaurantDetailsProgress(true);
  viewModel.showRestaurantDetailsEmpty(false);
  viewModel.showRestaurantDetailsError(false);

  axios.get('https://api.foursquare.com/v2/venues/search', {
    params: {
      'll': restaurant.location.lat + ',' + restaurant.location.lng,
      'intent': 'match',
      'query': restaurant.name,
      'client_id': FOURSQUARE_CLIENT_ID,
      'client_secret': FOURSQUARE_CLIENT_SECRET,
      'v': FOURSQUARE_DATE_VERSION
    }
  }).then(function (response) {
    console.log(response);

    const venue = response.data.response.venues && response.data.response.venues[0];
    if (venue) {
      const restaurantDetails = {
        name: venue.name,
        checkinCount: venue.stats.checkinsCount,
        tipCount: venue.stats.tipCount,
        usersCount: venue.stats.usersCount,
        site: venue.url,
        photo: restaurant.photos[0].getUrl({'maxWidth': 360, 'maxHeight': 300})
      };

      viewModel.restaurantDetails(restaurantDetails);
    } else {
      viewModel.showRestaurantDetailsEmpty(true);
    }

    viewModel.showRestaurantDetailsProgress(false);
  }).catch(function (error) {
    console.log(error);

    viewModel.restaurantDetailsError(error);
    viewModel.showRestaurantDetailsProgress(false);
    viewModel.showRestaurantDetailsError(true);
  });
}