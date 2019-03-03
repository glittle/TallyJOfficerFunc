/* eslint-disable promise/no-nesting */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Since this code will be running in the Cloud Functions enviornment
// we call initialize Firestore without any arguments because it
// detects authentication from the environment.
const firestore = admin.firestore();

// Create a new function which is triggered on changes to /status/{uid}
// Note: This is a Realtime Database trigger, *not* Cloud Firestore.
exports.onUserStatusChanged = functions.database.ref('/status/{uid}').onUpdate(
    (change, context) => {
        const uid = context.params.uid;

        // Get the data written to Realtime Database
        const dbEntry = change.after.val();
        const status = dbEntry.status;
        const electionId = dbEntry.electionId;
        const memberId = dbEntry.memberId;

        const version = 7;

        console.log('status changed', version, uid, memberId, electionId);

        if (status === 'offline') {
            // only concerned about noticing when someone leaves the election

            firestore
                .collection("elections")
                .doc(electionId)
                .collection("members")
                .doc(memberId)
                .update({
                    connected: false
                })
                .then(() => console.log('disconnected', memberId))
                .catch(error => {
                    console.log("Error disconnecting member.", error);
                });
        }
        // electionsQuerySnapshot.forEach(electionSnapshot => {
        //     var election = electionSnapshot.data();

        //     console.log('checking election', election, 'for', uid);
        //     console.log('Test', electionSnapshot.collection, election.collection);

        //     election.collection('members')
        //         .where('connected', '==', uid)
        //         .get()
        //         .then(membersQuerySnapshot => {
        //             console.log('members empty?', membersQuerySnapshot.empty);

        //             membersQuerySnapshot.forEach(memberSnapshot => {
        //                 var member = memberSnapshot.data();
        //                 console.log('FOUND the member!', member);
        //             });
        //             return true;
        //         })
        //         ;
        //     return false;
        // });
        return 'done';
        //     }).catch(error => {
        //     console.log("Error getting documents: ", error);
        // });
    });

//     const userStatusFirestoreRef = firestore.doc(`status/${context.params.uid}`);

// }

// // Then use other event data to create a reference to the
// // corresponding Firestore document.
// const userStatusFirestoreRef = firestore.doc(`status/${context.params.uid}`);

// // It is likely that the Realtime Database change that triggered
// // this event has already been overwritten by a fast change in
// // online / offline status, so we'll re-read the current data
// // and compare the timestamps.
// return change.after.ref.once('value').then((statusSnapshot) => {
// const status = statusSnapshot.val();
// console.log(status, dbEntry);
// // If the current timestamp for this data is newer than
// // the data that triggered this event, we exit this function.
// if (status.last_changed > dbEntry.last_changed) {
//     return null;
// }

// // Otherwise, we convert the last_changed field to a Date
// dbEntry.last_changed = new Date(dbEntry.last_changed);

// // ... and write it to Firestore.
// return userStatusFirestoreRef.set(dbEntry);