'use strict'

/* Imports */
let bcrypt = require("bcrypt"); // encryption module
let Users = require("./../models/Users.js") // Users database model
let IdGenerator = require("./../helpers/IdGenerator.js"); // a class that generates unique user ids
let Chat = require("./../models/Chat.js");
let PersonalRydes = require("./../models/PersonalRydes.js");
let Rydes = require("./../models/Rydes.js");
let RydeID = require("./../models/RydeID.js");
let Config = require('../config');
let OneSignalClient = require('node-onesignal').default; // require the module
let client = new OneSignalClient(Config.APP_ID, Config.REST_API_KEY); // create a new clinet
let util = require('util');

/* Constants */
const SALT = 10; // salt for bycrpt password hashing

class Controller {

	constructor() {
		this.modelUsers = new Users();
		this.idGen = new IdGenerator();
		this.modelChat = new Chat();
		this.modelPersonalRydes = new PersonalRydes();
		this.modelRydes = new Rydes();
		this.rydeID = new RydeID();

	}

	intro() {
		console.log('Server is listening on port 3000...');
	}

	// contains the logic for the login feature of the app
	login(req, res) {
		// First thing we have to do is query mongodb and find the object
		// using the email, after finding the object we have to compare
		// the password hash provided by the user and the password hash in the database
		this.modelUsers.query({"email": req.body.email}, (doc) => {
			// bcrypt.compare will compare the password attribute of the object provided
			// by the user with the document object's password field in mongodb
			// bcrypt.compare(), takes two 3 arguments, the password in strings, the
			// hashed password and the callback function
			bcrypt.compare(req.body.password, doc.password, (err, result) => {
				if (err) {
					res.sendStatus(404);
				} else {
					// if result is true it means that both the passwords match
					if (result === true) {
						// Before sending back a response object that will be passed around
						// as props, we need to compare the deviceId of the current deviceId
						// been used to login and the deviceId stored in the database.
						// If they are the same then we use the already stored doc.deviceId.
						// If they're different we update the deviceId in the database with
						// the new(current) one.

						// We needed to make this function a callback because of javascripts
						// asynchronous nature the rest of the code will run before this
						// function returns, i.e resObj attributes were being set before the
						// function returns.
						this.compareAndUpdateDeviceId(req, doc, (err, updatedDoc) => {
							if(err) {
								// console.log("Err: " + err);
								res.sendStatus(err);
							} else {
								// creating a response object to send back to the client
								let resObj = {};
								resObj.firstName = doc.firstName;
								resObj.lastName = doc.lastName;
								resObj.email = doc.email;
								resObj.dob = doc.dob;
								resObj.phone = doc.phone;
								resObj.gender = doc.gender;
								resObj.plate = doc.plate;
								resObj.car = doc.car;
								resObj.allInfoFilled = doc.allInfoFilled;
								resObj.id = doc.id;
								resObj.totalRating = doc.totalRating;
								resObj.numRating = doc.numRating;

								// check to know if deviceId was updated so that we can put
								// the right deviceId in resObj
								if(updatedDoc.deviceId !== doc.deviceId) {
									resObj.deviceId = updatedDoc.deviceId;
									res.status(200).send(resObj);
								} else {
									resObj.deviceId = doc.deviceId;
									res.status(200).send(resObj);
								}
							}
						});
					} else {
						res.sendStatus(404);
					}
				}
			});
		}, () => {
			res.sendStatus(404);
		});
	}

	// Function compares current deviceId and deviceId stroed in the database
	// If different, update the stored one with the new one and return the
	// updated user object
	// else return the old one
	compareAndUpdateDeviceId(req, doc, callback) {
		if(req.body.deviceId !== doc.deviceId){
			this.modelUsers.update({"email": req.body.email}, {deviceId: req.body.deviceId}, (userDocObj) => {
				console.log('deviceId successfully updated');
				callback(null, userDocObj);
			},() => {
				callback(404, null);
			});
		} else {
			console.log('deviceId the same. No need for an update');
			callback(null, doc);
		}
	}

	// contains the logic for the register feature of the app
	register(req, res) {
		bcrypt.genSalt(SALT, (err, salt) => {
			if (err) {
				res.sendStatus(404);
			} else {
				bcrypt.hash(req.body.password, salt, (err, hash) => {
					req.body.password = hash;
					this.idGen.generate(req.body.firstName, req.body.lastName, req.body.email);
					req.body.id = this.idGen.retrieve();
					this.modelUsers.insert(req.body, () => {
						res.sendStatus(200);
					}, () => {
						res.sendStatus(404);
					});
				})
			}
		})
	}

	emailCheck(req, res) {
		this.modelUsers.query({"email": req.body.email}, (doc) => {
			// if doc returned by mongo db isn't null we know
			// that the email provided by the user already exists
			res.sendStatus(404);
		}, () => {
			// on failure call back mongo db will return the doc as null
			// if its null it means the email is unique
			res.sendStatus(200);
		});
	}

	driverInfo(req, res) {
		this.modelUsers.update({"email": req.body.email}, {plate: req.body.plate, liscense: req.body.liscense, car: req.body.car, allInfoFilled: true}, () => {
			res.sendStatus(200);
		}, () => {
			res.sendStatus(404);
		});
	}

	createPersonalRyde(req, res) {
		this.modelPersonalRydes.insert({"email": req.params.email, "rydesPostedAsDriver": [], "rydesAppliedToAsPassenger": [], "rydesAcceptedToAsPassenger": []}, () => {
			res.sendStatus(200);
		}, () => {
			res.sendStatus(404);
		});
	}


	getPassengerRequests(req, res) {
		this.modelPersonalRydes.query({"email": req.params.email}, (doc) => {
			// on successfully querying the data we sent the res object back
			// the response object
			let resObj = {};
			// we look for the ryde by rydeId in the personal database's rydesPostedAsDriver field
			for (let i = 0; i < doc.rydesPostedAsDriver.length; ++i) {

				if (doc.rydesPostedAsDriver[i].rydeId === req.body.rydeId) {
					resObj.pending = doc.rydesPostedAsDriver[i].pending;
					// we break the loop when we find the ryde
					break;
				}

			}
			res.status(200).send(resObj);
		}, () => {
			// on unsuccesful query we sent 404 code
			res.sendStatus(404);
		});
	}

	// sends push notification to passenger when passenger has been accepted to join driver's ryde
	sendRydeAcceptNotification(driverRideObj, passengerObj){
		this.modelUsers.query({"email": passengerObj.email}, (doc) => {
			let driverFirstName 	 = driverRideObj.firstName;
			let driverLastName  	 = driverRideObj.lastName;
			let driverfrom  			 = driverRideObj.from;
			let driverTo  				 = driverRideObj.to;
			let playerId 					 = doc.deviceId;

			// try adding '\n' to go to next line so that notification appears on two lines
			let message = driverFirstName + ' ' + driverLastName + ' has accepted your ride request from ' +
										driverfrom + ' to ' + driverTo;

			// let data = [];

			// send a notification
			client.sendNotification(message, {
			  include_player_ids: [playerId]
				});
		console.log('notification sent to passenger');

		}, () => {
			console.log('Error retrieving passenger object ryde object');
		});
	}


	acceptedUpdatedRydes(req, res) {
		this.modelPersonalRydes.query({"email": req.params.email}, (doc) => {

			// 1 - update object in global rydes collection (check)
			// 2 - update driver's personal ryde object in rydesPostedAsDriver (check)
			// 3 - update passenger's personal ryde ryde objects rydesAppliedToAsPassenger and rydesAcceptedToAsPassenger
			// 4 - update all the rydesAcceptedToAsPassenger array's ryde object for all the members of that ryde

			let rydeToModify = undefined;
			let rydeIndexModified = 0;
			// we loop over the array of rydes posted by the driver
			for (let i = 0; i < doc.rydesPostedAsDriver.length; ++i) {
				// if the ryde object in the rydesPostedAsDriver array's id matches the id of the card
				// we assign the ryde object to a variable
				if (doc.rydesPostedAsDriver[i].rydeId === req.body.rydeId) {
					rydeToModify = doc.rydesPostedAsDriver[i];
					// we save the index of the array for which the ryde object we are modifying
					rydeIndexModified = i;
					// we break the loop as we no longer need to iterate the array
					break;
				}
			}

			// if the ryde has maximum members we send an error request saying ryde is full
			if (Number(rydeToModify.numPassengers) === rydeToModify.members.length) {
				// 410 gone code is sent indicating ryde is full
				res.sendStatus(410);
				// we return to prevent the code below from executing if this happens
				return;
			}

			// we get the user object form the request array to be inserted
			// back into the members array of the ryde object
			let userMember = undefined;
			// we loop over the pending array of the ryde object
			for (let i = 0; i < rydeToModify.pending.length; ++i) {
				if (rydeToModify.pending[i].email === req.body.acceptedPassengerEmail) {
					userMember = rydeToModify.pending[i];
					// we remove the user from the pending array
					rydeToModify.pending.splice(i, 1);
				}
			}
			// we insert the user the user to the members of the ride now
			rydeToModify.members.push(userMember);
			// we update the ryde at the index that we just modified
			doc.rydesPostedAsDriver[rydeIndexModified] = rydeToModify;
			// step -2 completed here
			this.modelPersonalRydes.update({"email": req.params.email}, {"rydesPostedAsDriver": doc.rydesPostedAsDriver} ,(doc) => {
				// step - 1 completed here
				// now what we need to do is update the universal Rydes database, and update only the fields that we need to modify
				this.modelRydes.update({"rydeId": rydeToModify.rydeId}, {"members": rydeToModify.members, "pending": rydeToModify.pending}, () => {
					// now we update the user's personal ryde the field which says rydesAcceptedToAsPassenger
					// we use update push here because we are pushing a ride to an already existing array
					// step - 3 complete
					this.modelPersonalRydes.updatePush({"email": userMember.email}, {"rydesAcceptedToAsPassenger": rydeToModify}, () => {
						// now we remove the element from rydesAppliedToAsPassenger and update that array
						// in the passenger's personal ryde object
						this.modelPersonalRydes.query({"email": userMember.email}, (doc) => {
							let arrayToModify = doc.rydesAppliedToAsPassenger;
							for (let i = 0; i < arrayToModify.length; ++i) {
								// we find the ryde object that the user applied to
								if (arrayToModify[i].driver === rydeToModify.driver) {
									arrayToModify.splice(i, 1);
									// we break the loop when we find it
									break;
								}
							}

							// step - 3 complete
							// now we update the fields rideAcceptedToAsPassenger in the personal ryde object for the passenger
							this.modelPersonalRydes.update({"email": userMember.email}, {"rydesAppliedToAsPassenger": arrayToModify}, () => {
								// now we have to iterate over each members of the ride and change the ryde object that they have
								let membersOfRyde = rydeToModify.members;
								// we loop over the members of the array
								for (let i = 0; i < membersOfRyde.length; ++i) {
									// using the email of each user we access their own personalRyde object
									// and change the rydeAcceptedAsPassenger array's ryde in it
									this.modelPersonalRydes.query({"email": membersOfRyde[i].email}, (doc) => {

										// the array of rydes that the user has been accepted to
										let myRydes = doc.rydesAcceptedToAsPassenger;

										for (let j = 0; j < myRydes.length; ++j) {
											// now we need to find the specific ryde object we are dealing with
											// from the array of rydes
											if (myRydes[j].rydeId === rydeToModify.rydeId) {

												// if we find the ryde we are looking for in myRydes we just
												// assign rydeToModify which is the modified ryde to that index
												// of the array replacing the item
												myRydes[j] = rydeToModify;
												break;
											}
										}
										// step - 4 complete
										this.modelPersonalRydes.update({"email": membersOfRyde[i].email}, {"rydesAcceptedToAsPassenger": myRydes}, () => {
											// can't send 200 code here as we are in a for loop and we can't send multiple codes for one request
										}, () => {
											// on failure we send the 404 code
											res.sendStatus(404);
										});

									}, () => {
										// on failure we send the 404 code
										res.sendStatus(404);
									});
								}

								// on success we send the 200 code
								res.sendStatus(200);

							}, () => {
								// on failure we send the 404 code
								res.sendStatus(404);
							});
						}, () => {
							// on failure we send a 404 code
							res.sendStatus(404);
						});
					}, () => {
						// on failure callback we sent the 404 code
						res.sendStatus(404);
					});
				}, () => {
					// on unsuccessful callback we sent 404 code
					res.sendStatus(404);
				});
			}, () => {
				// error on trying to update
				res.sendStatus(404);
			});
			if(rydeToModify !== undefined) {
				this.sendRydeAcceptNotification(rydeToModify, userMember);
			} else {
				console.log('Error accepting request since the ryde is full');
			}
		}, () => {
			// on unsuccesful query we sent 404 code
			res.sendStatus(404);

		});
	}

	rejectedUpdatedRydes(req, res) {
		this.modelPersonalRydes.query({"email": req.params.email}, (doc) => {
			let rydeToModify = undefined;
			let rydeIndexModified = 0;
			// we loop over the array of rydes posted by the driver
			for (let i = 0; i < doc.rydesPostedAsDriver.length; ++i) {
				// if the ryde object in the rydesPostedAsDriver array's id matches the id of the card
				// we assign the ryde object to a variable
				if (doc.rydesPostedAsDriver[i].rydeId === req.body.rydeId) {
					rydeToModify = doc.rydesPostedAsDriver[i];
					// we save the index of the array for which the ryde object we are modifying
					rydeIndexModified = i;
					// we break the loop as we no longer need to iterate the array
					break;
				}
			}
			// we loop over the pending array of the ryde object
			for (let i = 0; i < rydeToModify.pending.length; ++i) {
				if (rydeToModify.pending[i].email === req.body.rejectedPassengerEmail) {
					// we remove the user from the pending array
					rydeToModify.pending.splice(i, 1);
				}
			}
			// we update the ryde at the index that we just modified
			doc.rydesPostedAsDriver[rydeIndexModified] = rydeToModify;
			this.modelPersonalRydes.update({"email": req.params.email}, {"rydesPostedAsDriver": doc.rydesPostedAsDriver} ,(doc) => {
				// now what we need to do is update the universal Rydes database, and update only the fields that we need to modify
				this.modelRydes.update({"rydeId": rydeToModify.rydeId}, {"members": rydeToModify.members, "pending": rydeToModify.pending}, () => {
					// now we remove the element from rydesAppliedToAsPassenger and update that array
					// in the passenger's personal ryde object
					this.modelPersonalRydes.query({"email": req.body.rejectedPassengerEmail}, (doc) => {
						let arrayToModify = doc.rydesAppliedToAsPassenger;
						for (let i = 0; i < arrayToModify.length; ++i) {
							// we find the ryde object that the user applied to
							if (arrayToModify[i].driver === rydeToModify.driver) {
								arrayToModify.splice(i, 1);
								// we break the loop when we find it
								break;
							}
						}
						this.modelPersonalRydes.update({"email": req.body.rejectedPassengerEmail}, {"rydesAppliedToAsPassenger": arrayToModify}, () => {
							// now we have to iterate over each members of the ride and change the ryde object that they have
							let membersOfRyde = rydeToModify.members;
							// we loop over the members of the array
							for (let i = 0; i < membersOfRyde.length; ++i) {
								// using the email of each user we access their own personalRyde object
								// and change the rydeAcceptedAsPassenger array's ryde in it
								this.modelPersonalRydes.query({"email": membersOfRyde[i].email}, (doc) => {

									// the array of rydes that the user has been accepted to
									let myRydes = doc.rydesAcceptedToAsPassenger;

									for (let j = 0; j < myRydes.length; ++j) {
										// now we need to find the specific ryde object we are dealing with
										// from the array of rydes
										if (myRydes[j].rydeId === rydeToModify.rydeId) {
											// if we find the ryde we are looking for in myRydes we just
											// assign rydeToModify which is the modified ryde to that index
											// of the array replacing the item
											myRydes[j] = rydeToModify;
											break;
										}
									}
									this.modelPersonalRydes.update({"email": membersOfRyde[i].email}, {"rydesAcceptedToAsPassenger": myRydes}, () => {
										// can't send 200 code here as we are in a for loop and we can't send multiple codes for one request
									}, () => {
										// on failure we send the 404 code
										res.sendStatus(404);
									});

								}, () => {
									// on failure we send the 404 code
									res.sendStatus(404);
								});
							}
							// on success we send 200 code
							res.sendStatus(200);
						}, () => {
							// on failure we send the 404 code
							res.sendStatus(404);
						});
					}, () => {
						// on failure we send the 404 code
						res.sendStatus(404);
					});
				}, () => {
					// on unsuccessful callback we sent 404 code
					res.sendStatus(404);
				});
			}, () => {
				// error on trying to update
				res.sendStatus(404);
			});
		}, () => {
			// on unsuccesful query we sent 404 code
			res.sendStatus(404);
		});
	}

	endTrip(req, res) {

		// Step - 1 - Find the ryde object from mongodb
		// Step - 2 - List all the user in the ryde and pending users in the ryde
		this.modelRydes.query({"rydeId": req.body.ryde.rydeId}, (doc) => {

			// Step - 1 and Step - 2 complete
			let members = doc.members
			let pendings = doc.pending

			// all the members of the ryde will have their own personalRyde object
			// where they will have the rydeObject in rydesAcceptedToAsPassenger

			// Step - 3 - all these rydes from each passenger must be removed

			// looping over the members of the ryde
			for (let i = 0; i < members.length; ++i) {
				// retrieveing the personal ryde objects of each member
				this.modelPersonalRydes.query({"email": members[i].email}, (doc) => {
					// find the ryde from the array of rydes
					for (let j = 0; j < doc.rydesAcceptedToAsPassenger.length; ++j) {
						if (doc.rydesAcceptedToAsPassenger[j].rydeId === req.body.ryde.rydeId) {
							// splice will remove the element at that index from the array
							// and slice will just extract that element
							doc.rydesAcceptedToAsPassenger.splice(j, 1)
							break;
						}
					}
					this.modelPersonalRydes.update({"email": members[i].email}, {"rydesAcceptedToAsPassenger": doc.rydesAcceptedToAsPassenger});
				});
			}

			// Step - 3 complete

			// all the pending users will have their own personalRyde object where they
			// will have the rydeObject in their rydesAppliedToAsPassenger

			// Step - 4 - all these rydes from each pending user must be removed
			// looping over the pending users
			for (let i = 0; i < pendings.length; ++i) {
				this.modelPersonalRydes.query({"email": pendings[i].email}, (doc) => {
					for (let j = 0; j < doc.rydesAppliedToAsPassenger.length; ++j) {
						if (doc.rydesAppliedToAsPassenger[j].rydeId === req.body.ryde.rydeId) {
							doc.rydesAppliedToAsPassenger.splice(j, 1);
							break;
						}
					}
					this.modelPersonalRydes.update({"email": pendings[i].email}, {"rydesAppliedToAsPassenger": doc.rydesAppliedToAsPassenger});
				});
			}
			// step - 4 - complete

			// step - 5 - remove ryde from driver's personal ryde which means it will be inside
			// the drivers rydesPostedAsDriver
			this.modelPersonalRydes.query({"email": req.body.driver.email}, (doc) => {
				// lets now loop over the rydesPostedAsDriver array
				for (let i = 0; i < doc.rydesPostedAsDriver.length; ++i) {
					if (doc.rydesPostedAsDriver[i].rydeId === req.body.ryde.rydeId) {
						doc.rydesPostedAsDriver.splice(i, 1)
						break;
					}
				}

				this.modelPersonalRydes.update({"email": req.body.driver.email}, {"rydesPostedAsDriver": doc.rydesPostedAsDriver})
			});

			// step - 5 - complete

			// step - 6 - now finally we remove the universal ryde object

			this.modelRydes.remove({"rydeId": req.body.ryde.rydeId});

			// step - 6 - complete

			res.sendStatus(200);

		}, () => {
			// on failure the 404 code is sent
			res.sendStatus(404);
		});
	}


	postRyde(req, res){
		this.modelRydes.insert(req.body, () => {
			this.modelPersonalRydes.query({"email": req.body.driver}, (doc) => {
				doc.rydesPostedAsDriver.push(req.body);
				this.modelPersonalRydes.update({"email": req.body.driver}, {rydesPostedAsDriver: doc.rydesPostedAsDriver}, (doc) => {
					res.sendStatus(200);
				}, () => {
					res.sendStatus(404);
				});
			}, () => {
				res.sendStatus(404);
			});
		}, () => {
			res.sendStatus(404);
		});
	}

	findRyde(req, res){

		// Looking for Rydes with same destination
		this.modelRydes.findAll({"to": req.body.to}, (cursor) => {

			let potentialRides = cursor.toArray();
			let sameDestination = {dest:[]};

			potentialRides.then((response) => {

				for (let i = 0; i < response.length; i++){

					if (response[i].from.toLowerCase() === req.body.from.toLowerCase() && response[i].to.toLowerCase() === req.body.to.toLowerCase() && response[i].date === req.body.date){

						sameDestination.dest.push(response[i]);
					}
				}

				res.status(200).send(sameDestination);
			});
		}, () => {
			res.sendStatus(404);
		});
	}



	//for getting posts as a driver
	driverView(req, res){
		this.modelPersonalRydes.query({"email": req.params.email}, (doc) => {
			let obj = [];
			for(let i=0;i<doc.rydesPostedAsDriver.length;i++){
				obj.push(doc.rydesPostedAsDriver[i])
			}
			res.status(200).send(obj);
		}, () => {
			res.sendStatus(404);
		});
	}

	//for getting pending requests as a passenger
	pending(req,res){
		this.modelPersonalRydes.query({"email": req.params.email}, (doc) => {
			let obj = [];
			for(let i =0; i< doc.rydesAppliedToAsPassenger.length; i++){
				obj.push(doc.rydesAppliedToAsPassenger[i]);
			}
			res.status(200).send(obj);
		}, () => {
			res.sendStatus(404);
		})
	}

	//for getting available requests as a passenger
	available(req, res) {
		this.modelPersonalRydes.query({"email": req.params.email}, (doc) => {
			let obj = [];
			for(let i=0;i<doc.rydesAcceptedToAsPassenger.length;i++){
				obj.push(doc.rydesAcceptedToAsPassenger[i]);
			}
			res.status(200).send(obj);
		}, () => {
			res.sendStatus(404);
		})
	}


	// sends push notification to driver when passenger requests to join driver's ryde
	sendRydeRequestNotification(req){
		this.modelUsers.query({"email": req.body.driverRes.driver}, (doc) => {
			let passengerFirstName = req.body.myRes.firstName;
			let passengerLastName  = req.body.myRes.lastName;
			let driverfrom  			 = req.body.driverRes.from;
			let driverTo  				 = req.body.driverRes.to;
			let playerId 					 = doc.deviceId;

			let message = passengerFirstName + ' ' + passengerLastName + ' has requested to join your ride from ' +
										driverfrom + ' to ' + driverTo;

			// let data = [];

			// send a notification
			client.sendNotification(message, {
			  include_player_ids: [playerId]
			});
		console.log('Notification sent to driver');

		}, () => {
			console.log('Error retrieving driver ryde object');
		});
	}

	getUpdatedRyde(req, res) {
		// the variable in the param is a string which needs to be converted into a number
		this.modelRydes.query({"rydeId": Number(req.params.rydeId)}, (doc) => {
			res.status(200).send(doc)
		}, () => {
			// on error the 404 code is sent
			res.sendStatus(404);
		})
	}

	passengerRatings(req, res) {

		let successIndicator = true

		// loop over the members array and add the newly sent ratings
		for (let i = 0; i < req.body.members.length; ++i) {
			// we only update ratings if they are not - 1, if they are -1 it means
			// the driver never really sent any ratings
			if (req.body.ratings[i] !== -1) {

				this.modelUsers.query({"email": req.body.members[i].email}, (doc) => {
					// total ratings increases for the user
					doc.totalRating += Number(req.body.ratings[i]);
					// number of ratings increases
					++doc.numRating;
					this.modelUsers.update({"email": req.body.members[i].email}, {"totalRating": doc.totalRating, "numRating": doc.numRating});
				}, () => {
					successIndicator = false;
				})

			}
		}

		if (successIndicator) {
			// means nothing went wrong
			res.sendStatus(200);
		} else {
			// successIndicator being false means something went wrong
			res.sendStatus(404);
		}


	}

	driverRatings(req, res) {
		if (req.body.ratings !== -1) {
			// using the ryde objects email get the driver from Users collection
			this.modelUsers.query({"email": req.body.rydeObj.driver}, (doc) => {
				doc.totalRating += Number(req.body.ratings)
				++doc.numRating;
				this.modelUsers.update({"email": req.body.rydeObj.driver}, {"totalRating": doc.totalRating, "numRating": doc.numRating}, (doc) => {
					// on success send the 200 code
					res.sendStatus(200);
				}, () => {
					// on failure send the 404 code
					res.sendStatus(404);
				})
			}, () => {
				// on failure send the 404 message
				res.sendStatus(404);
			});
		} else {
			// on success and when nothing to update we send the 200 code
			res.sendStatus(200);
		}
	}

	removePassenger(req, res) {
		// effects who?
		// the universal ryde object (check)
		// The driver's personal ryde object - rydesPostedAsDriver (check)
		// the passenger removed's personal rydeObject - rydesAcceptedToAsPassenger (check)
		// all the members in the ryde's ryde object - rydesAcceptedToAsPassenger (check)

		let rydeId = req.body.rydeId;
		let memberRemoved = req.body.memberRemoved
		let driverEmail = req.body.driverEmail

		// I retrive the rydeObject from the universal rydeDatebase
		this.modelRydes.query({"rydeId": rydeId}, (doc) => {

			let rydeToModify = doc;

			for (let i = 0; i < rydeToModify.members.length; ++i) {
				// if the members email at that particular index matches the member to be removed email address
				// we remove the member from the email
				if (rydeToModify.members[i].email === memberRemoved) {
					rydeToModify.members.splice(i, 1);
					// I break the loop as I got what I wanted from the loop and it does not need to iterate more
					break;
				}
			}

			this.modelRydes.update({"rydeId": rydeId}, {"members": rydeToModify.members} ,(doc) => {
				this.modelPersonalRydes.query({"email": driverEmail}, (doc) => {
					for (let i = 0; i < doc.rydesPostedAsDriver.length; ++i) {
						if (doc.rydesPostedAsDriver[i].rydeId === rydeId) {
							doc.rydesPostedAsDriver[i] = rydeToModify;
							// we are done with the for loop
							break;
						}
					}

					this.modelPersonalRydes.update({"email": driverEmail}, {"rydesPostedAsDriver": doc.rydesPostedAsDriver}, (doc) => {

						this.modelPersonalRydes.query({"email": memberRemoved}, (doc) => {

							for (let i = 0; i < doc.rydesAcceptedToAsPassenger.length; ++i) {
								if (doc.rydesAcceptedToAsPassenger[i].rydeId === rydeId) {
									// the ryde is removed from the member that got kicked out
									doc.rydesAcceptedToAsPassenger.splice(i, 1)
									// we are done with the for loop
									break;
								}
							}

							this.modelPersonalRydes.update({"email": memberRemoved}, {"rydesAcceptedToAsPassenger": doc.rydesAcceptedToAsPassenger}, () => {

								let successIndicator = true;

								let members = rydeToModify.members;

								// now looping over the members in the array and modfying their rydesAcceptedToAsPassenger's ryde object
								for (let i = 0; i < members.length; ++i) {

									this.modelPersonalRydes.query({"email": members[i].email}, (doc) => {

										for (let j = 0; j < doc.rydesAcceptedToAsPassenger.length; ++j) {
											if (doc.rydesAcceptedToAsPassenger[j].rydeId === rydeId) {
												doc.rydesAcceptedToAsPassenger[j] = rydeToModify;
												break;
											}
										}

										this.modelPersonalRydes.update({"email": members[i].email}, {"rydesAcceptedToAsPassenger": doc.rydesAcceptedToAsPassenger}, (doc) => {}, () => {
											successIndicator = false;
										})

									}, () => {
										successIndicator = false;
									});
								}

								if (!successIndicator) {
									// on error send the 404 code
									res.sendStatus(404);
								} else {
									// on success send the 200 code
									res.sendStatus(200);
								}

							}, () => {
								// on failure the 404 code is sent
								res.sendStatus(404);
							});
						}, () => {
							// send the 404 code on failure
							res.sendStatus(404);
						});

					}, () => {
						// on error send the 404 code
						res.sendStatus(404);
					});
				}, () => {
					res.sendStatus(404);
				});

			}, () => {
				// on error the 404 code is sent
				res.sendStatus(404);
			})

		}, () => {
			// on error the 404 code is sent
			res.sendStatus(404);
		});

	}

//used by PassengerAvailableRideProfile to get drievrdata
	getDriverData(req,res){
		this.modelUsers.query({"email": req.params.email}, (doc) => {
				console.log(doc);
				let resObj = {};
				resObj.firstName = doc.firstName;
				resObj.lastName = doc.lastName;
				resObj.totalRating = doc.totalRating;
				resObj.numRating = doc.numRating;

				res.status(200).send(resObj);
		}, () => {
			res.sendStatus(404);
		})
	}

	//used by PassengerPendingRideProfile to get getDriverData
	getDriverDataPending(req,res){
		this.modelUsers.query({"email": req.params.email}, (doc) => {
				console.log(doc);
				let resObj = {};
				resObj.firstName = doc.firstName;
				resObj.lastName = doc.lastName;
				resObj.totalRating = doc.totalRating;
				resObj.numRating = doc.numRating;

				res.status(200).send(resObj);
		}, () => {
			res.sendStatus(404);
		})
	}

	//used by PassengerSearchProfile to get drievr data
	getDriverDataSearch(req,res){
		this.modelUsers.query({"email": req.params.email}, (doc) => {
				console.log(doc);
				let resObj = {};
				resObj.firstName = doc.firstName;
				resObj.lastName = doc.lastName;
				resObj.totalRating = doc.totalRating;
				resObj.numRating = doc.numRating;

				res.status(200).send(resObj);
		}, () => {
			res.sendStatus(404);
		})
	}

  	//used when you request to join a ride as a passenger. this is related to the passengersearchprofile.js
	//use updatePush for the request for passengers.
	//update the ryde collection, requests [] with the passenger info
	//update the personalrydes collection, rydespostedasdriver, requests with the passenger info
	//update the personalrydes collection, rydesAppliedToAsPassenger with the ride info
	passengerSearch(req,res) {
		this.modelRydes.query({"rydeId": req.body.driverRes.rydeId}, (doc) => {
			//doesn't let user request twice
			for(let i = 0; i < doc.pending.length; ++i){
				if(doc.pending[i].email === req.body.myRes.email){
					res.sendStatus(404);
					return;
				}
			}
			//doesn't let a user who have been accepted request again
			for(let i = 0; i < doc.members.length; ++i){
				if(doc.members[i].email === req.body.myRes.email){
					res.sendStatus(404);
					return;
				}
			}

			this.modelRydes.updatePush({"rydeId": req.body.driverRes.rydeId}, {"pending":req.body.myRes},() => {

				this.modelPersonalRydes.query({"email": req.body.driverRes.driver}, (doc)=> {

					let rydeToModify = undefined;
					// we also need a variable to save the index of rydesPostedAsDriver array which was going to be modified
					let indexModified = 0;
					for (let i = 0; i < doc.rydesPostedAsDriver.length; ++i) {
						// we find the specific ryde from the array of rydes that the driver posted
						if (doc.rydesPostedAsDriver[i].rydeId === req.body.driverRes.rydeId) {
							rydeToModify = doc.rydesPostedAsDriver[i];
							indexModified = i;
						}
					}

					rydeToModify.pending.push(req.body.myRes);

					doc.rydesPostedAsDriver[indexModified] = rydeToModify;

					this.modelPersonalRydes.update({"email": req.body.driverRes.driver}, {"rydesPostedAsDriver": doc.rydesPostedAsDriver}, (doc) => {

						this.modelRydes.query({"rydeId": req.body.driverRes.rydeId}, (docs) => {

							for(let j=0;j<docs.pending.length;++j) {

								this.modelPersonalRydes.query({"email": docs.pending[j].email}, (docss)=> {
									let appliedRydes = docss.rydesAppliedToAsPassenger;

									for(let i=0;i<appliedRydes.length;++i){

										if(appliedRydes[i].rydeId === rydeToModify.rydeId){

											appliedRydes[i] = rydeToModify;

											//adds the object again
											this.modelPersonalRydes.update({"email":docs.pending[j].email}, {"rydesAppliedToAsPassenger": appliedRydes}, () => {

												//res.sendStatus(200);
											}, () => {
												res.sendStatus(404);
											});

											return;
										}
									}

										this.modelPersonalRydes.updatePush({"email":docs.pending[j].email}, {"rydesAppliedToAsPassenger": rydeToModify}, () => {

											}, () => {
												res.sendStatus(404);
											});
										}, () => {
											res.sendStatus(404);
										});
									}

									this.sendRydeRequestNotification(req);
									res.sendStatus(200);
								}, () => {
									res.sendStatus(404);
								});
							}, () => {
							res.sendStatus(404);
						});

					}, () => {
						res.sendStatus(404);
					});

				}, () => {
					res.sendStatus(404);
				});

			}, () => {
				res.sendStatus(404);
			});
	}


	getRydeID(req, res){

		this.rydeID.query({"queryField": req.body.query}, (doc) => {

			console.log("Ryde ID retrieved and sent");
			res.status(200).send(doc);
		}, () => {

			console.log("Ryde ID not retrieved");
			res.sendStatus(404);
		});
	}

	incrementRydeID(req, res){

		// Update object in DB with the incremented Ryde ID
		this.rydeID.update({"queryField": req.body.query}, {rydeID: req.body.rydeID + 1}, () => {

			console.log("Ryde ID has been incremented to " + (req.body.rydeID + 1));
			res.sendStatus(200);
		}, () => {
			console.log("Ryde ID has not been incremented");
			res.sendStatus(404);
		});
	}


	err(req, res) {
		console.log("Processing error....");
		res.sendStatus(404);
	}


	socketIntro() {
		console.log("Socket is open on port 4000..."); // ???????? DO WE NEED THIS ???????????
	}


	connection(socket) {
		console.log("Connection received from " +  socket.id + "...");
	}

	idEnquiry(socket) {
		console.log("Id has been sent by the socket...");
		// creating a promise for the async socket event
		return new Promise((resolve, reject) => {
			socket.on("idEnquiry", (id) => {
				console.log("Socket request " + id +  "...");
				socket.join(id);
				resolve(id);
			})
		});
	}

	initMessages(socket, id) {
		this.modelChat.query({"rydeId": id}, (doc) => {

			// successful in finding the object from mongodb
			console.log("Success emission...");
			socket.emit(id + "/success");

			console.log(id + "/initMessages" + " emission...");
			socket.emit(id + "/initMessages", doc);

		}, () => {

			// failure in finding the object in mongodb
			console.log("Failure emission...");
			socket.emit(id + "/failure");
		});
	}


	storeChat(io, socket, id) {
		socket.on(id + "/storeChat", (reqObj) => {
			console.log("Socket request " + id + "/storeChat...");
			this.modelChat.query({"rydeId": Number(id)}, (doc) => {
				// we update the text array in the database by adding the new messages to it
				// from the request objects body containing the new text
				doc.texts.unshift(reqObj.text);
				// if we find the object we then update it
				this.modelChat.update({"rydeId": reqObj.rydeId}, {rydeId: reqObj.rydeId, texts: doc.texts}, (doc) => {
					// sending socket connection for success in the job
					console.log("Success emission...");
					socket.emit(id + "/success");

					// now to broadcast the message to everyone in the chat room
					console.log("Broadcasting message from room-" + id + " emission");
					io.to(id).emit(id + "/broadcast", doc);

				}, () => {
					// sending socket connection for failure in the job
					console.log("Failure emission...");
					socket.emit(id + "/failure");
				});
			}, () => {
				// if we can't find the object we insert the object
				let dbObj = {
					rydeId: reqObj.rydeId,
					texts: []
				}
				// pushing the message received to the db object's texts attribute
				// which is an array
				dbObj.texts.unshift(reqObj.text);
				this.modelChat.insert(dbObj, () => {
					// sending socket connection for success in the job
					console.log("Success emission...");
					socket.emit(id + "/success");

					// now we broadcast the message to everyone in the chat room
					console.log("Broadcasting message from room-" + id + " emission");
					io.to(id).emit(id + "/broadcast", dbObj);

				}, () => {
					// sending socket connection for failure in the job
					console.log("Failure emission...");
					socket.emit(id + "/failure");
				});

			});
		});
	}
}

module.exports = Controller;
