#! /usr/bin/env node

var path = require('path');
var fs = require('fs');
var http = require('http');
var Datastore = require('nedb');  // database
var mustache = require('mustache'); // template engine

var db = new Datastore({ filename: path.join(__dirname, 'vot.db'), autoload: true });
db.ensureIndex({ fieldName: 'full_name', unique: true }, function (err) {});
var file = path.join(__dirname, 'vot.dat');
var view = {};
var output;


function populate_db(callback) {
  fs.readFile(file, 'utf8', function (err, data) {
    if (err) {
      return console.error(err);
    }

    var arr = data.split('\n');
    var tasksToGo = arr.length;
    arr.forEach(function (line) {
      var date_raw = line.substring(8,14)
      var date = Date.parse(date_raw);
      var full_name = line.substring(15,50).trim();
      var tmp_name_arr = full_name.split(" ");
      var last_name = tmp_name_arr.splice(0, 1)[0];
      var first_name = tmp_name_arr.join(" ");
      var vote = line.substring(63,64);

      // full_name included for unique constraint
      var doc = { full_name: full_name,
                  first_name: first_name,
                  last_name: last_name,
                  vote: vote,
                  date: date };

      db.insert(doc);

      if (--tasksToGo === 0) {
        callback();
      }
    });
  });
}



function query_db(callback) {
  // equivalent to sql: select vote from db
  db.find({}, {vote: 1, _id: 0}, function (err, docs) {

    var votes = {}
    // count votes 
    var key;
    for (var i = 0; i < docs.length; ++i) {
      key = docs[i].vote;
      if (key in votes) {
        votes[key].count += 1;
      }
      else {
        // initialize counter
        votes[key] = {};
        votes[key].vote = key;
        votes[key].count = 1;
        votes[key].last_voters = [];
      }
    }

    // last voters
    var tasksToGo = Object.keys(votes).length;
    for (key in votes) {
      // category last vote's date
      db.findOne({vote: key}).sort({date: -1}).exec( function (err, doc) {
        var last_date = doc.date;
        var vote = doc.vote;
        votes[vote].last_voting_date = last_date;
        //  voters on last day (might be more then one)
        db.find({vote: vote, date: last_date}, function (err, docs) {
          var vote;
          var first_name;
          for (var i = 0; i < docs.length; ++i) {
            vote = docs[i].vote;
            first_name = docs[i].first_name;
            votes[vote].last_voters.push(first_name);
          }

          if (--tasksToGo === 0) {

            // console.log(votes);
            // { '1': 
            //    { vote: '1',
            //      count: 11,
            //      last_voters: [ 'Daniel', 'Andrei', 'Bogdan Mihail' ],
            //      last_voting_date: 989528400000 },
            //   '2': 
            //    { vote: '2',
            //      count: 21,
            //      last_voters: [ 'Daniela' ],
            //      last_voting_date: 989528400000 },
            //   '3': 
            //    { vote: '3',
            //      count: 4,
            //      last_voters: [ 'Ionut', 'Simona' ],
            //      last_voting_date: 989442000000 },
            //   '4': 
            //    { vote: '4',
            //      count: 7,
            //      last_voters: [ 'Eduard', 'Vlad Cristian' ],
            //      last_voting_date: 989528400000 },
            //   '#': 
            //    { vote: '#',
            //      count: 5,
            //      last_voters: [ 'Florin' ],
            //      last_voting_date: 989614800000 } }

            callback(votes);
          }
        })
      });
    }
  });
}



function render_template(data) {
  // populate view
  view["votes"] = []
  for (key in data) {
    view["votes"].push(data[key]);
  }

  // scale function to exaggerate graph dimensions
  view["scale"] = function() {return this * 30;};

  // read template file
  fs.readFile(path.join(__dirname, 'template.mustache.html'), 'utf8', function (err, template) {
    if (err) {
      return console.error(err);
    }
    // render template
    output = mustache.render(template, view)
  });
}



// main
populate_db( function () {
  query_db(render_template)
});



// http server
var requestListener = function (req, res) {
  res.writeHead(200);
  res.end(output);
}

var server = http.createServer(requestListener);
server.listen(3000, function () {
  console.log('Server listening on http://localhost:3000')
});