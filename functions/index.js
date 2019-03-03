// back end processes for TallyJ Officer
// include a version number in logs to know when a new version of this code is in use
const version = 13;

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const firestore = admin.firestore();

exports.manageVotes = functions.firestore.document('/elections/{electionId}').onUpdate((change, context) => {
    console.log('changes...', version);
    const electionId = context.params.electionId;
    const newValue = change.after.data();
    const oldValue = change.before.data();
    if (newValue.votingOpen && !oldValue.votingOpen) {
        console.log('voting just opened', newValue);
        // need to assign voting slots to members

        // randomize the order
        var memberIds = newValue.members.map(id => {
            return { id: id, sort: Math.random() };
        });
        memberIds.sort((a, b) => (a.sort < b.sort ? -1 : 1));

        var voteSymbols = Object.keys(newValue.currentVotes);

        if (voteSymbols.length !== memberIds.length) {
            // something went wrong!
            console.log('voteSymbol !== membercount', voteSymbols.length, memberIds.length);
            return false;
        }

        memberIds.forEach((memberInfo, i) => {
            // tell this member their symbol
            var symbol = voteSymbols[i];
            console.log('set', electionId, memberInfo.id, symbol);
            firestore.collection('elections').doc(electionId).collection('memberSymbols').doc(memberInfo.id)
                .set({
                    symbol: voteSymbols[i]
                })
                .then(() => {
                    console.log("Symbol successfully written!");
                    return true;
                })
                .catch((error) => {
                    console.error("Error writing symbol: ", error);
                });
        })
    }
    return 'done';
});


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