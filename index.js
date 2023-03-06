/**
 * Heartbeat for ensuring socket connection to server during periods of inactivity 
 */
let _heartbeat = null;
const HEARTBEAT_FREQUENCY = 20000
const HEARTBEAT_EXPIRATION = 30000;

/**
 * the Web Socket that the connects to the server. To be set in the "connect" function
 */
let socket = null;

let votes = 10;

/**
 * The amount of nominations remaining a user has to give
 */
let nominations = 3;

/**
 * The username of the user
 */
let username = "";

/**
 * the id of the user - received upon connecting to the server
 */
let id = null;

const production = "wss://raikes-sockets-lab-server.fly.dev";

const development = "ws://localhost:8080"

/**
 * the URL that the server is hosted at - you must connect to this!
 */
const URL = production;

/**
 * The number of votes that a user has given a particular pokemon
 * @key - string - pokemon name
 * @value - number - number of votes the user has committed
 */
let _myVotes = new Map();

/**
 * The names that you have nominated
 */
let _myNominations = [];

/**
 * An array of all currently nominated pokemon
 */
let nominees = [];

/**
 * A helper function that parses raw string data received from the server and converts it to JSON
 * @param {string} eventData - the data received from the server
 * @returns a JSON object representing the data
 */
function dataToJSON(eventData) {
	return JSON.parse(eventData);
}

const _set_connect_button_loading = () => {
	const button = document.getElementById("connect");
	button.disabled = true;
	button.style.filter = "brightness(50%)";
	let waitTimer = 1;
	const timeOut = setInterval(() => {
		const dots = [...new Array((waitTimer % 3) + 1).keys()]
			.map((_i) => ".")
			.join("");
		button.innerText = `Loading${dots}`;
		waitTimer += 1;
	}, 500);
	return timeOut;
};

/**
 * UI helper to delete all nominee cards
 */
const _delete_all_nominee_cards = () => {
	nominees.forEach((nom) => {
		const card = document.getElementById(`${nom.name}_card`);
		card.remove();
	});
};

/**
 * UI helper function for unnominate onClick
 * @param {HTMLButtonElement} cardNominate - the button to change
 */
const _switch_to_nominate_button = (cardNominate) => {
	cardNominate.style.backgroundColor = "rgb(216, 185, 82)";
	cardNominate.innerText = "Nominate";
};

/**
 *
 * @param {HTMLButtonElement} cardNominate - the button to change
 */
const _switch_to_rescind_button = (cardNominate) => {
	cardNominate.style.backgroundColor = "rgb(142, 124, 245)";
	cardNominate.innerText = "Rescind";
};

/**
 * lol
 */
function fun() {
	const wrapper = document.getElementsByClassName("wrapper")[0]
	wrapper.remove();
	const root = document.getElementsByTagName("body")[0];
	root.style.backgroundImage = "none";
	root.style.backgroundColor = "black";
	root.style.backgroundImage = "none";
	root.style.display = "flex";
	root.style.justifyContent = "center";
	root.style.alignItems = "center";
	
	const pTag = document.createElement("p");
	pTag.innerText = "Nice Try";
	pTag.style.color = "white";
	root.appendChild(pTag);
}

/**
 * UI helper to enable or disable downvote buttons
 */
const _updateDownvoteButtonsUI = () => {
	console.log(_myVotes);
	[..._myVotes.entries()].forEach((entry) => {
		const [nomineeName, nomVotes] = entry;
		const downvoteButton = document.getElementById(
			`${nomineeName}_downvote`
		);
		if (nomVotes <= 0) {
			downvoteButton.style.filter = "brightness(50%)";
			downvoteButton.disabled = true;
		} else {
			downvoteButton.style.filter = "brightness(100%)";
			downvoteButton.disabled = false;
		}
	});
};

/**
 * UI helper to enable or disable upvote buttons
 */
const _updateUpvoteButtonsUI = () => {
	[..._myVotes.entries()].forEach((entry) => {
		const [nomineeName, _nomVotes] = entry;
		const upvoteButton = document.getElementById(`${nomineeName}_upvote`);
		if (votes <= 0) {
			upvoteButton.style.filter = "brightness(50%)";
			upvoteButton.disabled = true;
		} else {
			upvoteButton.style.filter = "brightness(100%)";
			upvoteButton.disabled = false;
		}
	});
};

/**
 * UI helper to enable or disable a given pokemon's "Nominate" button
 * @param {string} nomineeName - the name of the nominee that you are changing the nominate button's functionality for
 * @param {boolean} disable - true if you are disabling the button, false if enabling it
 */
const _updateNominateButtonFunctionalityForNominee = (nomineeName, disable) => {
	const nominee = nominees.find((nom) => nom.name === nomineeName);
	const nominateButton = document.getElementById(
		`${nomineeName}_fetched_nominate`
	);
	if (nominee && nominee.nominater.id === id) {
		nominateButton.disabled = false;
		nominateButton.style.filter = "brightness(100%)";
		return;
	}
	if (nominateButton) {
		if (nominations <= 0) {
			nominateButton.disabled = true;
			nominateButton.style.filter = `brightness(100%)`;
		}
		nominateButton.disabled = disable;
		nominateButton.style.filter = `brightness(${disable ? "50" : "100"}%)`;
	}
};

/**
 * A function that sorts all nominees by votes and re-displays them on the site
 */
function sortNominees() {
	nominees.sort((a, b) => b.votes - a.votes);
	_delete_all_nominee_cards();
	console.log(nominees);
	nominees.forEach((nom) => {
		buildNominee(nom.name, nom.votes, nom.nominater.username);
	});
}

/**
 * send a message to the server upon receiving a greeting
 * this is to automatically set the username of the user
 */
const sendUsername = () => {
	if (socket && id && username.length > 0) {
		const button = document.getElementById("connect");
		const input = document.getElementById("username");
		socket.send(JSON.stringify({ type: "GREET", id, username }));
		button.onclick = () => {};
		button.style.filter = "brightness(50%)";
		button.innerText = "Welcome, trainer!";
		input.disabled = true;
	}
};

/**
 * Helper function that updates nominees to newNominees, and also adds any
 * new nominees to the website UI.
 * @param {
* 		name: string, 
* 		votes: number, 
* 		nominater: { 
* 			username?: string | undefined;
* 			id: string;
* 			nominations: number;
* 			votes: number;
* 		};
* 	}[] - newNominees - An array of all the currently nominated nominees
*/
function updateNominees(newNominees) {
	_myNominations = newNominees.filter(nominee => nominee.nominater.id === id).map(nominee => nominee.name)
	// nomination occurred
	if (nominees.length <= newNominees.length) {
		newNominees.forEach((newNom) => {
			const alreadyNominated = nominees.find(
				(nom) => nom.name === newNom.name
			);
			// update votes map to include new votable entry
			const nomineeAlreadyVotable = _myVotes.get(newNom.name);
			if (!nomineeAlreadyVotable) {
				_myVotes.set(newNom.name, 0);
			}
			if (alreadyNominated) {
				// update votes on existing ui element
				alreadyNominated.votes = newNom.votes;
				const votesUI = document.getElementById(`${newNom.name}_votes`);
				votesUI.innerText = `Votes: ${newNom.votes}`;
				const nominaterUI = document.getElementById(
					`${newNom.name}_nominater`
				);
				nominaterUI.innerText = `${newNom.nominater.username}`;
				console.log(
					"disabling ",
					newNom.name,
					" if NOT the nominater..."
				);
				_updateNominateButtonFunctionalityForNominee(newNom.name, true);
			} else {
				buildNominee(
					newNom.name,
					newNom.votes,
					newNom.nominater.username
				);
				nominees.push(newNom);
				_updateNominateButtonFunctionalityForNominee(newNom.name, true);
			}
		});
	} else {
		nominees.forEach((nom) => {
			if (newNominees.every((newNom) => newNom.name !== nom.name)) {
				nominees = nominees.filter((n) => n.name !== nom.name);
				const cardToRemove = document.getElementById(
					`${nom.name}_card`
				);
				cardToRemove.remove();
				_updateNominateButtonFunctionalityForNominee(nom.name, false);
			}
			// remove from votes map as nominee is no longer votable
			const nomineeAlreadyVotable = _myVotes.get(nom.name);
			if (nomineeAlreadyVotable) {
				_myVotes.delete(nom.name);
			}
		});
	}
}

/**
 * A helper function that sets the "votes remaining" number to the new number you pass in
 * @param {number} newVotesRemaining - the new amount of votes you have remaining to display
 */
const updateVotesRemainingUI = (newVotesRemaining) => {
	const votesRemainingUI = document.getElementById("votes-remaining");
	votesRemainingUI.innerText = newVotesRemaining;
};

/**
 * A helper function that sets the "nominations remaining" number to the new number you pass in
 * @param {number} newNominationsRemaining - the new amount of nominations you have remaining to display
 */
const updateNominationsRemainingUI = (newNominationsRemaining) => {
	const nominationsRemainingUI = document.getElementById(
		"nominations-remaining"
	);
	nominationsRemainingUI.innerText = newNominationsRemaining;
};

/**
 * TODO: Fill out the rest of this function!
 * A function that sends a vote request to the server IF an id is set, and the user's username is not empty
 * @param {string} pokemon - the pokemon to give a vote to (or take a vote away from)
 * @param {boolean} upvote - true if you are voting for the pokemon, false if voting against
 */
function voteForPokemon(pokemon, upvote) {
	// your code goes here!
}

/**
 * TODO: Fill out the rest of this function!
 * A function that sends a nomination request to the server IF the user's id is set and has a non-empty username
 * @param {string} pokemon - the pokemon to nominate (or unnominate)
 * @param {boolean} nominate - whether the user is nominating or unnominating the pokemon
 */
function nominatePokemon(pokemon, nominate) {
	// your code goes here!
}

/**
 * TODO: Complete the rest of the functionality for this function!
 * You need to:
 * 		1. Connect to the server (the url to connect to is stored in the "URL" variable)
 * 		2. Handle when the client receives a "NOMINEES" event
 * 		3. Handle when the client receives an "UPDATE" event
 */
function connect() {
	// only connect if the socket hasn't already connected, and a username is set
	const timeOut = _set_connect_button_loading();
	if (!socket && username.length > 0) {
		/**
		 * TODO: Write a line here opening a socket connection with the server, and assign
		 * it to the socket variable!
		 */

		
		// heartbeat functionality - do NOT touch! D:<
		socket.onopen = () => {
			const button = document.getElementById("connect");
			button.innerText = "Welcome, trainer!";
			clearInterval(timeOut);
		};
		const heartbeat_message = {type: "HEARTBEAT"}
		const timeout = setInterval(() => {
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify(heartbeat_message));
				const sentTime = new Date().getTime();
				if (!_heartbeat) {
					_heartbeat = sentTime
				}
				if ((sentTime - _heartbeat) >= HEARTBEAT_EXPIRATION) {
					// server hasn't responded for 30 seconds, close connection
					socket.close();
				} 
			}
		  }, HEARTBEAT_FREQUENCY); // send heartbeat every 10 seconds
		

		socket.onmessage = (event) => {
			// convert the event data to JSON
			const eventData = dataToJSON(event.data);
			// TODO: handle both the "NOMINEES" event, and the "UPDATE" event
			switch (eventData.type) {
				case "NOMINEES": {
					/**
					 * TODO: Write logic here handling when the client
					 * receives a "NOMINEES" event from the server
					 */
					break;
				}
				case "UPDATE": {
					/**
					 * TODO: Write logic here handling when the client
					 * receives a "UPDATE" event from the server
					 */
					break;
				}
				case "GREET": {
					// This event code is already done for you! :D
					// set the client-side id of the user
					id = eventData.id;
					// update nominees to the initial nominees sent by the server
					updateNominees(eventData.nominees);
					// send the username to the server
					sendUsername();
					break;
				}
				case "HEARTBEAT" : {
					_heartbeat = new Date().getTime();
					break;
				}
				case "IP_SPAM" : {
					fun();
					break;
				}
			}
		};

		// cleanup for when the connection closes - do not touch! D:<
		socket.onclose = () => {
			alert("The connection has been closed :(\nRefresh the page and re-connect to the server")
			// stop sending heartbeat on close
			clearInterval(timeout);
			socket = null;
			const button = document.getElementById("connect");
			const input = document.getElementById("username");
			button.onClick = connect;
			button.innerText = "Join the Indigo League!";
			input.disabled = false;
			input.style.filter = "brightness(100%)";
		};
	}
}

/**
 * TODO: Write this function to nominate a given pokemon when this function is executed
 * Suggested: complete the "nominatePokemon" function first!
 * @param {string} name - the name of the pokemon
 * @param {HTMLButtonElement} cardNominate - the button that this function is running on
 */
const nominateOnClick = (name, cardNominate) => {
	nominatePokemon(name, true);
	_switch_to_rescind_button(cardNominate);
};

/**
 * TODO: Write this function to unnominate a given pokemon when this function is executed
 * Suggested: complete the "unnominatePokemon" function first!
 * @param {string} name - the name of the pokemon
 * @param {HTMLButtonElement} cardNominate - the button that this function is running on
 */
const unnominateOnClick = (name, cardNominate) => {
	nominatePokemon(name, false);
	_switch_to_nominate_button(cardNominate);
};

/**
 * @param {string} name - the name of the pokemon you are voting for
 */
const upvoteOnClick = (name) => {
	voteForPokemon(name, true);
};

/**
 * @param {string} name - the name of the pokemon you are rescinding a vote from
 */
const downvoteOnClick = (name) => {
	voteForPokemon(name, false);
};

/**
 * changes the username
 * @param {HTMLOnChangeEvent} event - the onChange event for this input field
 */
const usernameOnChange = (event) => {
	username = event.target.value;
	const connectButton = document.getElementById("connect");
	if (socket && id) {
		if (username.length !== 0) {
			connectButton.style.filter = "brightness(100%)";
			connectButton.onclick = changeUsername;
		} else {
			connectButton.style.filter = "brightness(50%)";
			connectButton.onclick = () => {};
		}
	}
};

async function getPokemon() {
	const pokemon = _only_fetch_as_needed(retrieveInputs());
	for (let i = 0; i < pokemon.length; i++) {
		const response = await fetch(
			`https://pokeapi.co/api/v2/pokemon/${pokemon[i]}/`
		);
		if (!response.ok) {
			console.error(`Could not fetch ${pokemon[i]} from pokeapi :(`);
			continue;
		}
		const data = await response.json();
		console.log(data);

		buildCard(
			data.name,
			data.types,
			data.stats[0].base_stat,
			data.stats[1].base_stat,
			data.stats[2].base_stat,
			data.stats[3].base_stat,
			data.stats[4].base_stat,
			data.stats[5].base_stat,
			data.abilities,
			data.height,
			data.weight,
			data.sprites.front_default
		);
	}
}

function _only_fetch_as_needed(pokemon) {
	const noDuplicates = [...new Set(pokemon)];
	pokemonToFetch = [];
	noDuplicates.forEach((name) => {
		console.log(name);
		fetchedPokemonCard = document.getElementById(`${name}_fetched_card`);
		if (!fetchedPokemonCard) {
			pokemonToFetch.push(name);
		}
	});
	return pokemonToFetch;
}

/**
 * A function to build the display cards on the website
 * @param {string} name - the name of the pokemon
 * @param {array} types - the "types" array that corresponds to the pokemon's types
 * @param {number} hp - the base HP value of the pokemon
 * @param {number} attack - the base attack value of the pokemon
 * @param {number} defense - the base defense value of the pokemon
 * @param {number} special_attack - the base special attack value of the pokemon
 * @param {number} special_defense - the base special defense value of the pokemon
 * @param {number} speed - the base speed value of the pokemon
 * @param {array} abilities - the "abilities" array that corresponds to the pokemon's abilities
 * @param {number} height - the height of the pokemon
 * @param {number} weight - the weight of the pokemon
 * @param {string} image_url - the url to an in-game sprite used for the pokemon
 */
function buildCard(
	name,
	types,
	hp,
	attack,
	defense,
	special_attack,
	special_defense,
	speed,
	abilities,
	height,
	weight,
	image_url,
	anchor = "cardContainer"
) {
	const card = document.createElement("div");
	card.className = "card";
	card.id = `${name}_fetched_card`;

	const cardImage = document.createElement("img");
	cardImage.src = image_url;
	card.placeholder = `Image of the pokemon: "${name.toUpperCase()}"`;
	card.appendChild(cardImage);

	const cardName = document.createElement("h1");
	cardName.innerHTML = name.toUpperCase();
	card.appendChild(cardName);

	const cardTypeTitle = document.createElement("h2");
	cardTypeTitle.innerHTML = `<strong>Types</strong>`;
	card.appendChild(cardTypeTitle);
	const cardTypesList = document.createElement("ul");
	for (let i = 0; i < types.length; i++) {
		const li = document.createElement("li");
		li.innerHTML = types[i].type.name;
		cardTypesList.appendChild(li);
	}
	card.appendChild(cardTypesList);

	const cardAbilitiesListTitle = document.createElement("h2");
	cardAbilitiesListTitle.innerHTML = "<strong>Abilities<strong>";
	card.appendChild(cardAbilitiesListTitle);
	const cardAbilitiesList = document.createElement("ul");
	for (let i = 0; i < abilities.length; i++) {
		const li = document.createElement("li");
		li.innerHTML = abilities[i].ability.name;
		cardAbilitiesList.appendChild(li);
	}
	card.appendChild(cardAbilitiesList);

	const cardStatisticsTitle = document.createElement("h2");
	cardStatisticsTitle.innerHTML = "<strong>Stats<strong>";
	card.appendChild(cardStatisticsTitle);

	const cardStatisticsTable = document.createElement("table");
	const tr1 = document.createElement("tr");
	tr1.innerHTML = `<td><strong>Attack: <strong>${attack}</strong></td>
    <td><strong>Defense: <strong>${defense}</strong></td>`;
	cardStatisticsTable.appendChild(tr1);

	const tr2 = document.createElement("tr");
	tr2.innerHTML = `<td><strong>Sp. Atk: <strong>${special_attack}</strong></td>
    <td><strong>Sp. Def: <strong>${special_defense}</strong></td>`;
	cardStatisticsTable.appendChild(tr2);

	const tr3 = document.createElement("tr");
	tr3.innerHTML = `<td><strong>HP: <strong>${hp}</strong></td>
    <td><strong>Speed: <strong>${speed}</strong></td>`;
	cardStatisticsTable.appendChild(tr3);

	card.appendChild(cardStatisticsTable);

	const cardMiscStatsContainer = document.createElement("div");
	const cardHeight = document.createElement("caption");
	cardHeight.innerHTML = `<strong>Height: </strong>${
		Math.round(height * 10) / 100
	} m`;
	cardMiscStatsContainer.appendChild(cardHeight);
	const cardWeight = document.createElement("caption");
	cardWeight.innerHTML = `<strong>Weight: </strong>${
		Math.round(weight * 10) / 100
	} kg`;
	cardMiscStatsContainer.appendChild(cardWeight);
	card.appendChild(cardMiscStatsContainer);

	// vote and nominate buttons
	const cardNominateAndVoteContainer = document.createElement("div");
	const cardNominate = document.createElement("button");
	cardNominate.id = `${name}_fetched_nominate`;
	cardNominate.innerText = "Nominate";
	const nomOnClick = () => {
		nominateOnClick(name, cardNominate);
		cardNominate.onclick = () => {
			unnominateOnClick(name, cardNominate);
			cardNominate.onclick = nomOnClick;
		};
	};
	cardNominate.onclick = nomOnClick;
	console.log(nominees);
	if (nominees.some((nom) => nom.name === name)) {
		console.log("disabling nomination ability for ", name);
		cardNominate.disabled = true;
		cardNominate.style.filter = "brightness(50%)";
	}
	cardNominateAndVoteContainer.appendChild(cardNominate);
	// OLD - vote button on fetched card
	// const cardVote = document.createElement("button");
	// cardVote.innerText = "Vote";
	// cardVote.classList.add("vote");
	// const voteOnClick = () => {
	// 	upvoteOnClick(name, cardVote);
	// 	cardVote.onclick = () => {
	// 		downvoteOnClick(name, cardVote);
	// 		cardVote.onclick = voteOnClick;
	// 	};
	// };
	// cardVote.onclick = voteOnClick;
	// cardNominateAndVoteContainer.appendChild(cardVote);
	card.appendChild(cardNominateAndVoteContainer);

	const cardContainer = document.getElementById(anchor);
	cardContainer.append(card);

	if (nominees.some((nom) => nom.name === name)) {
		_updateNominateButtonFunctionalityForNominee(name, true);
	}
}

function buildNominee(name, votes, nominater) {
	const card = document.createElement("div");
	const nomineeName = document.createElement("h1");
	const nomineeVotes = document.createElement("h2");
	const nomineeNominaterContainer = document.createElement("div");
	const nomineeNominaterText = document.createElement("p");
	const nomineeNominater = document.createElement("p");
	const voteButtonsContainer = document.createElement("div");
	const upVoteButton = document.createElement("button");
	const downVoteButton = document.createElement("button");
	const upVoteOnClickHandler = () => {
		upvoteOnClick(name);
	};
	upVoteButton.onclick = upVoteOnClickHandler;
	const downVoteOnClickHandler = () => {
		downvoteOnClick(name);
	};
	downVoteButton.onclick = downVoteOnClickHandler;
	card.id = `${name}_card`;
	nomineeVotes.id = `${name}_votes`;
	card.classList.add("card");
	upVoteButton.classList.add("upvote");
	upVoteButton.innerText = "+ Vote";
	upVoteButton.id = `${name}_upvote`;
	downVoteButton.classList.add("downvote");
	downVoteButton.innerText = "- Vote";
	downVoteButton.id = `${name}_downvote`;
	nomineeVotes.innerText = `Votes: ${votes}`;
	nomineeName.innerText = name;
	nomineeNominaterText.innerText = "Nominated by:";
	nomineeNominater.innerText = `${nominater}`;
	nomineeNominater.id = `${name}_nominater`;
	nomineeNominater.classList.add("nominater");
	const isMyNomination = _myNominations.some(myNom => myNom === name);
	if (isMyNomination) {
		upVoteButton.style.filter = "brightness(50%)";
		downVoteButton.style.filter = "brightness(50%)";
		upVoteButton.disabled = true
		downVoteButton.disabled = true
	}
	nomineeNominaterContainer.appendChild(nomineeNominaterText);
	nomineeNominaterContainer.appendChild(nomineeNominater);
	voteButtonsContainer.appendChild(upVoteButton);
	voteButtonsContainer.appendChild(downVoteButton);
	card.appendChild(nomineeName);
	card.appendChild(nomineeNominaterContainer);
	card.appendChild(nomineeVotes);
	card.appendChild(voteButtonsContainer);

	const anchor = document.getElementById("voting");
	anchor.appendChild(card);
}

function retrieveInputs() {
	const inputs = [];
	for (let i = 1; i < 6; i++) {
		const currInput = document.getElementById(`pkmn ${i}`);

		if (!(currInput.value === "")) {
			inputs.push(currInput.value);
			currInput.value = "";
		}
	}
	return inputs;
}

// function to be used in the "get pokemon button". Do not modify this function
function onClick() {
	getPokemon();
}

["pkmn 1", "pkmn 2", "pkmn 3", "pkmn 4", "pkmn 5"].forEach((id) => {
	document.getElementById(id).addEventListener("keyup", (e) => {
		if (e.code === "Enter") {
			document.getElementById("submit").click();
		}
	});
});
