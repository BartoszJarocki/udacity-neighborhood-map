import _ from 'lodash';
import ko from 'knockout';
import axios from 'axios';

const NO_SELECTION = {id: -1};

const FOURSQUARE_CLIENT_ID = '1LYQZGNJY5LEMM43JY3U11X12JQSBNLTFAIHFLJYECGP2EMX';
const FOURSQUARE_CLIENT_SECRET = '31SPAFT0LCOGKLSQUNJU1H3BZVP4PW0DGDCKN41ELLENWK1W';
const FOURSQUARE_DATE_VERSION = '20170701';

let restaurants = [];
let markers = [];

class Restaurant {
  constructor(data) {
    this.id = data.place_id;
    this.name = data.name;
    this.address = data.vicinity;
    this.location = {lat: data.geometry.location.lat(), lng: data.geometry.location.lng()};
    this.photos = data.photos;
  }
}

/**
 * Knockout JS ViewModel responsible for updating DOM
 */
function RestaurantsViewModel() {
  let self = this;

  // Current list of restaurants fetched from Google Places API
  self.restaurants = ko.observableArray(
    _.chain(restaurants)
      .map(restaurant => new Restaurant(restaurant))
      .value()
  );

  // Currently selected restaurant
  self.selectedRestaurant = ko.observable(NO_SELECTION);

  // Triggered when restaurant is selected from the sidebar
  // Triggers marker click and fetching the restaurant details
  self.restaurantClicked = function (restaurant) {
    console.log(restaurant);

    self.selectedRestaurant(restaurant);
    selectMarker(restaurant.id);
    fetchDetails(restaurant);
  };

  // Keeps the filter input
  self.filterQuery = ko.observable('');

  // Filters the restaurant list with entered by user filterQuery.
  // Triggered by clicking Filter button
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

  // Responsible for showing/hiding reset filter button
  self.filterMode = ko.computed(function () {
    return !_.isEmpty(self.filterQuery());
  });

  // Run when reset filter button is clicked
  // Clears the filterQuery
  self.resetFilter = function () {
    self.filterQuery('');
    self.filterRestaurants();
  };

  // Restaurant details object fetched from Google Places and Foursquare API
  self.restaurantDetails = ko.observable({});
  // Error string displayed when Foursquare API fails
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

const RADIUS = 5000;

/**
 * Run when map is loaded.
 */
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
  let request = {
    location: new google.maps.LatLng(location.lat, location.lng),
    radius: RADIUS,
    type: ['restaurant']
  };
  searchRestaurants(request);
}

function searchRestaurantsByBounds() {
  let request = {
    bounds: map.getBounds(),
    radius: RADIUS,
    type: ['restaurant']
  };
  searchRestaurants(request);
}

/**
 * Searches restaurants using Google Places API
 * @param request
 */
function searchRestaurants(request) {
  placesService.nearbySearch(request, onSearchResults);
}

/**
 * Called with Google Places API call results
 * @param results
 * @param status
 */
function onSearchResults(results, status) {
  viewModel.selectedRestaurant(NO_SELECTION);

  if (status === google.maps.places.PlacesServiceStatus.OK) {
    clearMarkers();
    restaurants = [];

    for (var i = 0; i < results.length; i++) {
      restaurants.push(new Restaurant(results[i]));
      markers.push(createMarker(results[i]));
    }
  }

  viewModel.restaurants(restaurants);
}

/**
 * Creates map object centered in given position and triggers initial restaurant search.
 * @param position
 */
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

/**
 * Centers the map to show all available markers.
 */
function centerMap() {
  const visibleMarkers = _.filter(markers, (marker) => marker.visible);
  let bounds = new google.maps.LatLngBounds();
  _.each(visibleMarkers, marker => {
    if (marker.visible) {
      marker.setMap(map);
      bounds.extend(marker.position);
    }
  });
  map.fitBounds(bounds);
}

/**
 * Creates Google Maps marker for given place and configures it to display restaurant details when clicked.
 * @param place
 * @returns {google.maps.Marker}
 */
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

/**
 * Triggers marker click programatically.
 * @param id
 */
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

/**
 * Filters all available markers to display only markers for currently filtered restaurants.
 */
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

/**
 * Fetches the restaurant details using Foursquare API
 * @param restaurant
 */
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