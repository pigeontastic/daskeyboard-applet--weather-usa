const q = require('daskeyboard-applet');
const request = require('request-promise');

const apiUrl = "https://api.weather.gov";
const serviceHeaders = {
  "User-Agent": "Das Keyboard q-applet-weather",
  "accept": "application/geo+json"
}

var zones = null;

const COLORS = Object.freeze({
  CLEAR: '#FFFF00',
  CLOUDY: '#FF00FF',
  SHOWER: '#0000FF',
  SNOW: '#FFFFFF',
  STORM: '#FF0000',
  SUNNY: '#FFFF00'
})


const FORECASTS = Object.freeze({
  CLEAR: 'CLEAR',
  CLOUDY: 'CLOUDY',
  SHOWER: 'SHOWER',
  SNOW: 'SNOW',
  STORM: 'STORM',
  SUNNY: 'SUNNY'
});


class Observation {
  constructor({
    clear = false,
    cloudy = false,
    shower = false,
    snow = false,
    storm = false,
    sunny = false,
    percent = 0
  }) {
    this.clear = clear;
    this.cloudy = cloudy;
    this.shower = shower;
    this.snow = snow;
    this.storm = storm;
    this.sunny = sunny;
    this.percent = percent;
  }

  isLikely() {
    return (this.percent && this.percent >= Observation.LIKELY_THRESHOLD);
  }

  isClear() {
    return this.clear;
  }

  isCloudy() {
    return this.cloudy;
  }

  isShower() {
    return this.shower && this.isLikely();
  }

  isSnow() {
    return this.snow && this.isLikely();
  }

  isStorm() {
    return this.storm && this.isLikely();
  }

  isSunny() {
    return this.sunny;
  }

  prioritize() {
    if (this.isSnow()) {
      return FORECASTS.SNOW;
    } else if (this.isStorm()) {
      return FORECASTS.STORM;
    } else if (this.isShower()) {
      return FORECASTS.SHOWER;
    } else if (this.isCloudy()) {
      return FORECASTS.CLOUDY;
    } else if (this.isSunny()) {
      return FORECASTS.SUNNY;
    } else {
      return FORECASTS.CLEAR;
    }
  }
}

Observation.LIKELY_THRESHOLD = 20;
const percentChangeExpression = /(\d\d) percent chance/;


/**
 * Evaluate a forecast string for specific features
 * @param {string} forecastText 
 */
function evaluateForecast(forecastText) {
  const forecast = forecastText.toLowerCase();
  const percentMatches = percentChangeExpression.exec(forecast);

  return new Observation({
    clear: forecast.includes('clear'),
    cloudy: forecast.includes('cloudy'),
    shower: forecast.includes('shower'),
    snow: forecast.includes('snow'),
    storm: forecast.includes('storm'),
    sunny: forecast.includes('sunny'),
    percent: (percentMatches && percentMatches.length > 1) ? percentMatches[1] : '0'
  });
}


async function getForecast(zoneId) {
  return request.get({
    url: apiUrl + `/zones/forecast/${zoneId}/forecast`,
    headers: serviceHeaders,
    json: true
  }).then(body => {
    const periods = body.periods;
    if (periods) {
      return periods;
    } else {
      throw new Error("No periods returned.");
    }
  }).catch((error) => {
    console.error("Caught error:", error);
    return null;
  })
}



class WeatherForecast extends q.DesktopApp {
  async selections(fieldName) {
    if (zones) {
      console.log("Sending preloaded zones");
      return this.processZones(zones);
    } else {
      console.log("Retrieving zones...");
      //const zones = require('./zones.json');
      return request.get({
        url: apiUrl + '/zones?type=forecast',
        headers: serviceHeaders,
        json: true
      }).then(body => {
        zones = body;
        return this.processZones(zones);
      }).catch((error) => {
        console.error("Caught error:", error);
      })
    }
  }

  /**
   * Process a zones JSON to an options list
   * @param {*} zones 
   */
  async processZones(zones) {
    console.log("Processing zones JSON");
    const options = [];
    for (let feature of zones.features) {
      if (feature.properties.type === 'public') {
        const id = feature.properties.id;
        let label = feature.properties.name;
        if (feature.properties.state) {
          label = label + ', ' + feature.properties.state;
        }
        options.push([id, label]);
      }
    }
    return options;
  }

  async run() {
    console.log("Running.");
    const zone = this.config.zoneId;
    if (zone) {
      console.log("My zone is: " + zone);
      return getForecast(zone).then(periods => {
        const width = this.geometry.width || 4;
        console.log("My width is: " + width);
        const points = [];
        if (periods && periods.length > 0) {
          console.log("Got forecast: " + zone);
          for (let i = 0; i < width; i += 1) {
            // we skip every other one because we get a daily and nightly
            // forecast for each day
            const period = periods[i * 2];
            const observation = evaluateForecast(period.detailedForecast);
            const forecastValue = observation.prioritize();
            const color = COLORS[forecastValue];
            points.push(new q.Point(color));
          }
          
          return new q.Signal({
            points: [points]
          });
        } else {
          console.log("No forecast for zone: " + zone);
          return null;
        }
      }).catch((error) => {
        console.error("Error while getting forecast:", error);
        return null;
      })
    } else {
      console.log("No zoneId configured.");
      return null;
    }
  }
}


module.exports = {
  FORECASTS: FORECASTS,
  Observation: Observation,
  WeatherForecast: WeatherForecast,
  evaluateForecast: evaluateForecast,
  getForecast: getForecast,
}

const applet = new WeatherForecast();