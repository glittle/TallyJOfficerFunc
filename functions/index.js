const version = 8; // include a version number in logs to know when a new version of this code is in use

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const firestore = admin.firestore();

exports.onUserStatusChanged = functions.database.ref('/status/{uid}').onUpdate(
    (change, context) => {
        // const uid = context.params.uid;

        // Get the data written to Realtime Database
        const dbEntry = change.after.val();
        const status = dbEntry.status;
        const electionId = dbEntry.electionId;
        const memberId = dbEntry.memberId;


        // console.log('status changed', version, uid, memberId, electionId);

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
                .then(() => console.log('disconnected', version, memberId))
                .catch(error => {
                    console.log("Error disconnecting member.", error);
                });
        }
        return 'done';
    });