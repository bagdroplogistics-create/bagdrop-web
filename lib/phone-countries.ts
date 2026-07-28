// BAGDROP — lib/phone-countries.ts
//
// Static list of all ITU-assigned country calling codes, generated once from
// libphonenumber-js metadata + Intl.DisplayNames (English names) rather than
// looked up at runtime — keeps this dependency-free at render time and portable
// to the React Native apps (mobile-app/, admin-app/), which duplicate this exact
// file (see the header comment there) since the three apps are separate npm
// projects and do not share a node_modules/workspace.
//
// Regenerate with: node — see scripts/gen-phone-countries.mjs

export interface CountryDialCode {
  iso2:      string  // ISO 3166-1 alpha-2, e.g. "IN"
  name:      string  // English display name, e.g. "India"
  dialCode:  string  // Calling code WITHOUT leading +, e.g. "91"
  flag:      string  // Emoji flag, e.g. "🇮🇳"
}

// Countries Bagdrop sees the most inquiries from — pinned to the top of the
// selector, above the alphabetical full list. Order here is the display order.
export const PREFERRED_COUNTRIES = ["IN", "US", "CA", "GB", "AU", "NZ", "AE", "SG"]

// Full list, alphabetical by name (matches every country tel-number-selector
// UX convention). PhoneInput re-sorts this at render time to float
// PREFERRED_COUNTRIES to the top; this array itself stays pure/alphabetical so
// it is trivially diffable against a future regeneration.
export const ALL_COUNTRIES: CountryDialCode[] = [
  {
    iso2: "AF",
    name: "Afghanistan",
    dialCode: "93",
    flag: "🇦🇫"
  },
  {
    iso2: "AX",
    name: "Åland Islands",
    dialCode: "358",
    flag: "🇦🇽"
  },
  {
    iso2: "AL",
    name: "Albania",
    dialCode: "355",
    flag: "🇦🇱"
  },
  {
    iso2: "DZ",
    name: "Algeria",
    dialCode: "213",
    flag: "🇩🇿"
  },
  {
    iso2: "AS",
    name: "American Samoa",
    dialCode: "1",
    flag: "🇦🇸"
  },
  {
    iso2: "AD",
    name: "Andorra",
    dialCode: "376",
    flag: "🇦🇩"
  },
  {
    iso2: "AO",
    name: "Angola",
    dialCode: "244",
    flag: "🇦🇴"
  },
  {
    iso2: "AI",
    name: "Anguilla",
    dialCode: "1",
    flag: "🇦🇮"
  },
  {
    iso2: "AG",
    name: "Antigua & Barbuda",
    dialCode: "1",
    flag: "🇦🇬"
  },
  {
    iso2: "AR",
    name: "Argentina",
    dialCode: "54",
    flag: "🇦🇷"
  },
  {
    iso2: "AM",
    name: "Armenia",
    dialCode: "374",
    flag: "🇦🇲"
  },
  {
    iso2: "AW",
    name: "Aruba",
    dialCode: "297",
    flag: "🇦🇼"
  },
  {
    iso2: "AC",
    name: "Ascension Island",
    dialCode: "247",
    flag: "🇦🇨"
  },
  {
    iso2: "AU",
    name: "Australia",
    dialCode: "61",
    flag: "🇦🇺"
  },
  {
    iso2: "AT",
    name: "Austria",
    dialCode: "43",
    flag: "🇦🇹"
  },
  {
    iso2: "AZ",
    name: "Azerbaijan",
    dialCode: "994",
    flag: "🇦🇿"
  },
  {
    iso2: "BS",
    name: "Bahamas",
    dialCode: "1",
    flag: "🇧🇸"
  },
  {
    iso2: "BH",
    name: "Bahrain",
    dialCode: "973",
    flag: "🇧🇭"
  },
  {
    iso2: "BD",
    name: "Bangladesh",
    dialCode: "880",
    flag: "🇧🇩"
  },
  {
    iso2: "BB",
    name: "Barbados",
    dialCode: "1",
    flag: "🇧🇧"
  },
  {
    iso2: "BY",
    name: "Belarus",
    dialCode: "375",
    flag: "🇧🇾"
  },
  {
    iso2: "BE",
    name: "Belgium",
    dialCode: "32",
    flag: "🇧🇪"
  },
  {
    iso2: "BZ",
    name: "Belize",
    dialCode: "501",
    flag: "🇧🇿"
  },
  {
    iso2: "BJ",
    name: "Benin",
    dialCode: "229",
    flag: "🇧🇯"
  },
  {
    iso2: "BM",
    name: "Bermuda",
    dialCode: "1",
    flag: "🇧🇲"
  },
  {
    iso2: "BT",
    name: "Bhutan",
    dialCode: "975",
    flag: "🇧🇹"
  },
  {
    iso2: "BO",
    name: "Bolivia",
    dialCode: "591",
    flag: "🇧🇴"
  },
  {
    iso2: "BA",
    name: "Bosnia & Herzegovina",
    dialCode: "387",
    flag: "🇧🇦"
  },
  {
    iso2: "BW",
    name: "Botswana",
    dialCode: "267",
    flag: "🇧🇼"
  },
  {
    iso2: "BR",
    name: "Brazil",
    dialCode: "55",
    flag: "🇧🇷"
  },
  {
    iso2: "IO",
    name: "British Indian Ocean Territory",
    dialCode: "246",
    flag: "🇮🇴"
  },
  {
    iso2: "VG",
    name: "British Virgin Islands",
    dialCode: "1",
    flag: "🇻🇬"
  },
  {
    iso2: "BN",
    name: "Brunei",
    dialCode: "673",
    flag: "🇧🇳"
  },
  {
    iso2: "BG",
    name: "Bulgaria",
    dialCode: "359",
    flag: "🇧🇬"
  },
  {
    iso2: "BF",
    name: "Burkina Faso",
    dialCode: "226",
    flag: "🇧🇫"
  },
  {
    iso2: "BI",
    name: "Burundi",
    dialCode: "257",
    flag: "🇧🇮"
  },
  {
    iso2: "KH",
    name: "Cambodia",
    dialCode: "855",
    flag: "🇰🇭"
  },
  {
    iso2: "CM",
    name: "Cameroon",
    dialCode: "237",
    flag: "🇨🇲"
  },
  {
    iso2: "CA",
    name: "Canada",
    dialCode: "1",
    flag: "🇨🇦"
  },
  {
    iso2: "CV",
    name: "Cape Verde",
    dialCode: "238",
    flag: "🇨🇻"
  },
  {
    iso2: "BQ",
    name: "Caribbean Netherlands",
    dialCode: "599",
    flag: "🇧🇶"
  },
  {
    iso2: "KY",
    name: "Cayman Islands",
    dialCode: "1",
    flag: "🇰🇾"
  },
  {
    iso2: "CF",
    name: "Central African Republic",
    dialCode: "236",
    flag: "🇨🇫"
  },
  {
    iso2: "TD",
    name: "Chad",
    dialCode: "235",
    flag: "🇹🇩"
  },
  {
    iso2: "CL",
    name: "Chile",
    dialCode: "56",
    flag: "🇨🇱"
  },
  {
    iso2: "CN",
    name: "China",
    dialCode: "86",
    flag: "🇨🇳"
  },
  {
    iso2: "CX",
    name: "Christmas Island",
    dialCode: "61",
    flag: "🇨🇽"
  },
  {
    iso2: "CC",
    name: "Cocos (Keeling) Islands",
    dialCode: "61",
    flag: "🇨🇨"
  },
  {
    iso2: "CO",
    name: "Colombia",
    dialCode: "57",
    flag: "🇨🇴"
  },
  {
    iso2: "KM",
    name: "Comoros",
    dialCode: "269",
    flag: "🇰🇲"
  },
  {
    iso2: "CG",
    name: "Congo - Brazzaville",
    dialCode: "242",
    flag: "🇨🇬"
  },
  {
    iso2: "CD",
    name: "Congo - Kinshasa",
    dialCode: "243",
    flag: "🇨🇩"
  },
  {
    iso2: "CK",
    name: "Cook Islands",
    dialCode: "682",
    flag: "🇨🇰"
  },
  {
    iso2: "CR",
    name: "Costa Rica",
    dialCode: "506",
    flag: "🇨🇷"
  },
  {
    iso2: "CI",
    name: "Côte d’Ivoire",
    dialCode: "225",
    flag: "🇨🇮"
  },
  {
    iso2: "HR",
    name: "Croatia",
    dialCode: "385",
    flag: "🇭🇷"
  },
  {
    iso2: "CU",
    name: "Cuba",
    dialCode: "53",
    flag: "🇨🇺"
  },
  {
    iso2: "CW",
    name: "Curaçao",
    dialCode: "599",
    flag: "🇨🇼"
  },
  {
    iso2: "CY",
    name: "Cyprus",
    dialCode: "357",
    flag: "🇨🇾"
  },
  {
    iso2: "CZ",
    name: "Czechia",
    dialCode: "420",
    flag: "🇨🇿"
  },
  {
    iso2: "DK",
    name: "Denmark",
    dialCode: "45",
    flag: "🇩🇰"
  },
  {
    iso2: "DJ",
    name: "Djibouti",
    dialCode: "253",
    flag: "🇩🇯"
  },
  {
    iso2: "DM",
    name: "Dominica",
    dialCode: "1",
    flag: "🇩🇲"
  },
  {
    iso2: "DO",
    name: "Dominican Republic",
    dialCode: "1",
    flag: "🇩🇴"
  },
  {
    iso2: "EC",
    name: "Ecuador",
    dialCode: "593",
    flag: "🇪🇨"
  },
  {
    iso2: "EG",
    name: "Egypt",
    dialCode: "20",
    flag: "🇪🇬"
  },
  {
    iso2: "SV",
    name: "El Salvador",
    dialCode: "503",
    flag: "🇸🇻"
  },
  {
    iso2: "GQ",
    name: "Equatorial Guinea",
    dialCode: "240",
    flag: "🇬🇶"
  },
  {
    iso2: "ER",
    name: "Eritrea",
    dialCode: "291",
    flag: "🇪🇷"
  },
  {
    iso2: "EE",
    name: "Estonia",
    dialCode: "372",
    flag: "🇪🇪"
  },
  {
    iso2: "SZ",
    name: "Eswatini",
    dialCode: "268",
    flag: "🇸🇿"
  },
  {
    iso2: "ET",
    name: "Ethiopia",
    dialCode: "251",
    flag: "🇪🇹"
  },
  {
    iso2: "FK",
    name: "Falkland Islands",
    dialCode: "500",
    flag: "🇫🇰"
  },
  {
    iso2: "FO",
    name: "Faroe Islands",
    dialCode: "298",
    flag: "🇫🇴"
  },
  {
    iso2: "FJ",
    name: "Fiji",
    dialCode: "679",
    flag: "🇫🇯"
  },
  {
    iso2: "FI",
    name: "Finland",
    dialCode: "358",
    flag: "🇫🇮"
  },
  {
    iso2: "FR",
    name: "France",
    dialCode: "33",
    flag: "🇫🇷"
  },
  {
    iso2: "GF",
    name: "French Guiana",
    dialCode: "594",
    flag: "🇬🇫"
  },
  {
    iso2: "PF",
    name: "French Polynesia",
    dialCode: "689",
    flag: "🇵🇫"
  },
  {
    iso2: "GA",
    name: "Gabon",
    dialCode: "241",
    flag: "🇬🇦"
  },
  {
    iso2: "GM",
    name: "Gambia",
    dialCode: "220",
    flag: "🇬🇲"
  },
  {
    iso2: "GE",
    name: "Georgia",
    dialCode: "995",
    flag: "🇬🇪"
  },
  {
    iso2: "DE",
    name: "Germany",
    dialCode: "49",
    flag: "🇩🇪"
  },
  {
    iso2: "GH",
    name: "Ghana",
    dialCode: "233",
    flag: "🇬🇭"
  },
  {
    iso2: "GI",
    name: "Gibraltar",
    dialCode: "350",
    flag: "🇬🇮"
  },
  {
    iso2: "GR",
    name: "Greece",
    dialCode: "30",
    flag: "🇬🇷"
  },
  {
    iso2: "GL",
    name: "Greenland",
    dialCode: "299",
    flag: "🇬🇱"
  },
  {
    iso2: "GD",
    name: "Grenada",
    dialCode: "1",
    flag: "🇬🇩"
  },
  {
    iso2: "GP",
    name: "Guadeloupe",
    dialCode: "590",
    flag: "🇬🇵"
  },
  {
    iso2: "GU",
    name: "Guam",
    dialCode: "1",
    flag: "🇬🇺"
  },
  {
    iso2: "GT",
    name: "Guatemala",
    dialCode: "502",
    flag: "🇬🇹"
  },
  {
    iso2: "GG",
    name: "Guernsey",
    dialCode: "44",
    flag: "🇬🇬"
  },
  {
    iso2: "GN",
    name: "Guinea",
    dialCode: "224",
    flag: "🇬🇳"
  },
  {
    iso2: "GW",
    name: "Guinea-Bissau",
    dialCode: "245",
    flag: "🇬🇼"
  },
  {
    iso2: "GY",
    name: "Guyana",
    dialCode: "592",
    flag: "🇬🇾"
  },
  {
    iso2: "HT",
    name: "Haiti",
    dialCode: "509",
    flag: "🇭🇹"
  },
  {
    iso2: "HN",
    name: "Honduras",
    dialCode: "504",
    flag: "🇭🇳"
  },
  {
    iso2: "HK",
    name: "Hong Kong SAR China",
    dialCode: "852",
    flag: "🇭🇰"
  },
  {
    iso2: "HU",
    name: "Hungary",
    dialCode: "36",
    flag: "🇭🇺"
  },
  {
    iso2: "IS",
    name: "Iceland",
    dialCode: "354",
    flag: "🇮🇸"
  },
  {
    iso2: "IN",
    name: "India",
    dialCode: "91",
    flag: "🇮🇳"
  },
  {
    iso2: "ID",
    name: "Indonesia",
    dialCode: "62",
    flag: "🇮🇩"
  },
  {
    iso2: "IR",
    name: "Iran",
    dialCode: "98",
    flag: "🇮🇷"
  },
  {
    iso2: "IQ",
    name: "Iraq",
    dialCode: "964",
    flag: "🇮🇶"
  },
  {
    iso2: "IE",
    name: "Ireland",
    dialCode: "353",
    flag: "🇮🇪"
  },
  {
    iso2: "IM",
    name: "Isle of Man",
    dialCode: "44",
    flag: "🇮🇲"
  },
  {
    iso2: "IL",
    name: "Israel",
    dialCode: "972",
    flag: "🇮🇱"
  },
  {
    iso2: "IT",
    name: "Italy",
    dialCode: "39",
    flag: "🇮🇹"
  },
  {
    iso2: "JM",
    name: "Jamaica",
    dialCode: "1",
    flag: "🇯🇲"
  },
  {
    iso2: "JP",
    name: "Japan",
    dialCode: "81",
    flag: "🇯🇵"
  },
  {
    iso2: "JE",
    name: "Jersey",
    dialCode: "44",
    flag: "🇯🇪"
  },
  {
    iso2: "JO",
    name: "Jordan",
    dialCode: "962",
    flag: "🇯🇴"
  },
  {
    iso2: "KZ",
    name: "Kazakhstan",
    dialCode: "7",
    flag: "🇰🇿"
  },
  {
    iso2: "KE",
    name: "Kenya",
    dialCode: "254",
    flag: "🇰🇪"
  },
  {
    iso2: "KI",
    name: "Kiribati",
    dialCode: "686",
    flag: "🇰🇮"
  },
  {
    iso2: "XK",
    name: "Kosovo",
    dialCode: "383",
    flag: "🇽🇰"
  },
  {
    iso2: "KW",
    name: "Kuwait",
    dialCode: "965",
    flag: "🇰🇼"
  },
  {
    iso2: "KG",
    name: "Kyrgyzstan",
    dialCode: "996",
    flag: "🇰🇬"
  },
  {
    iso2: "LA",
    name: "Laos",
    dialCode: "856",
    flag: "🇱🇦"
  },
  {
    iso2: "LV",
    name: "Latvia",
    dialCode: "371",
    flag: "🇱🇻"
  },
  {
    iso2: "LB",
    name: "Lebanon",
    dialCode: "961",
    flag: "🇱🇧"
  },
  {
    iso2: "LS",
    name: "Lesotho",
    dialCode: "266",
    flag: "🇱🇸"
  },
  {
    iso2: "LR",
    name: "Liberia",
    dialCode: "231",
    flag: "🇱🇷"
  },
  {
    iso2: "LY",
    name: "Libya",
    dialCode: "218",
    flag: "🇱🇾"
  },
  {
    iso2: "LI",
    name: "Liechtenstein",
    dialCode: "423",
    flag: "🇱🇮"
  },
  {
    iso2: "LT",
    name: "Lithuania",
    dialCode: "370",
    flag: "🇱🇹"
  },
  {
    iso2: "LU",
    name: "Luxembourg",
    dialCode: "352",
    flag: "🇱🇺"
  },
  {
    iso2: "MO",
    name: "Macao SAR China",
    dialCode: "853",
    flag: "🇲🇴"
  },
  {
    iso2: "MG",
    name: "Madagascar",
    dialCode: "261",
    flag: "🇲🇬"
  },
  {
    iso2: "MW",
    name: "Malawi",
    dialCode: "265",
    flag: "🇲🇼"
  },
  {
    iso2: "MY",
    name: "Malaysia",
    dialCode: "60",
    flag: "🇲🇾"
  },
  {
    iso2: "MV",
    name: "Maldives",
    dialCode: "960",
    flag: "🇲🇻"
  },
  {
    iso2: "ML",
    name: "Mali",
    dialCode: "223",
    flag: "🇲🇱"
  },
  {
    iso2: "MT",
    name: "Malta",
    dialCode: "356",
    flag: "🇲🇹"
  },
  {
    iso2: "MH",
    name: "Marshall Islands",
    dialCode: "692",
    flag: "🇲🇭"
  },
  {
    iso2: "MQ",
    name: "Martinique",
    dialCode: "596",
    flag: "🇲🇶"
  },
  {
    iso2: "MR",
    name: "Mauritania",
    dialCode: "222",
    flag: "🇲🇷"
  },
  {
    iso2: "MU",
    name: "Mauritius",
    dialCode: "230",
    flag: "🇲🇺"
  },
  {
    iso2: "YT",
    name: "Mayotte",
    dialCode: "262",
    flag: "🇾🇹"
  },
  {
    iso2: "MX",
    name: "Mexico",
    dialCode: "52",
    flag: "🇲🇽"
  },
  {
    iso2: "FM",
    name: "Micronesia",
    dialCode: "691",
    flag: "🇫🇲"
  },
  {
    iso2: "MD",
    name: "Moldova",
    dialCode: "373",
    flag: "🇲🇩"
  },
  {
    iso2: "MC",
    name: "Monaco",
    dialCode: "377",
    flag: "🇲🇨"
  },
  {
    iso2: "MN",
    name: "Mongolia",
    dialCode: "976",
    flag: "🇲🇳"
  },
  {
    iso2: "ME",
    name: "Montenegro",
    dialCode: "382",
    flag: "🇲🇪"
  },
  {
    iso2: "MS",
    name: "Montserrat",
    dialCode: "1",
    flag: "🇲🇸"
  },
  {
    iso2: "MA",
    name: "Morocco",
    dialCode: "212",
    flag: "🇲🇦"
  },
  {
    iso2: "MZ",
    name: "Mozambique",
    dialCode: "258",
    flag: "🇲🇿"
  },
  {
    iso2: "MM",
    name: "Myanmar (Burma)",
    dialCode: "95",
    flag: "🇲🇲"
  },
  {
    iso2: "NA",
    name: "Namibia",
    dialCode: "264",
    flag: "🇳🇦"
  },
  {
    iso2: "NR",
    name: "Nauru",
    dialCode: "674",
    flag: "🇳🇷"
  },
  {
    iso2: "NP",
    name: "Nepal",
    dialCode: "977",
    flag: "🇳🇵"
  },
  {
    iso2: "NL",
    name: "Netherlands",
    dialCode: "31",
    flag: "🇳🇱"
  },
  {
    iso2: "NC",
    name: "New Caledonia",
    dialCode: "687",
    flag: "🇳🇨"
  },
  {
    iso2: "NZ",
    name: "New Zealand",
    dialCode: "64",
    flag: "🇳🇿"
  },
  {
    iso2: "NI",
    name: "Nicaragua",
    dialCode: "505",
    flag: "🇳🇮"
  },
  {
    iso2: "NE",
    name: "Niger",
    dialCode: "227",
    flag: "🇳🇪"
  },
  {
    iso2: "NG",
    name: "Nigeria",
    dialCode: "234",
    flag: "🇳🇬"
  },
  {
    iso2: "NU",
    name: "Niue",
    dialCode: "683",
    flag: "🇳🇺"
  },
  {
    iso2: "NF",
    name: "Norfolk Island",
    dialCode: "672",
    flag: "🇳🇫"
  },
  {
    iso2: "KP",
    name: "North Korea",
    dialCode: "850",
    flag: "🇰🇵"
  },
  {
    iso2: "MK",
    name: "North Macedonia",
    dialCode: "389",
    flag: "🇲🇰"
  },
  {
    iso2: "MP",
    name: "Northern Mariana Islands",
    dialCode: "1",
    flag: "🇲🇵"
  },
  {
    iso2: "NO",
    name: "Norway",
    dialCode: "47",
    flag: "🇳🇴"
  },
  {
    iso2: "OM",
    name: "Oman",
    dialCode: "968",
    flag: "🇴🇲"
  },
  {
    iso2: "PK",
    name: "Pakistan",
    dialCode: "92",
    flag: "🇵🇰"
  },
  {
    iso2: "PW",
    name: "Palau",
    dialCode: "680",
    flag: "🇵🇼"
  },
  {
    iso2: "PS",
    name: "Palestinian Territories",
    dialCode: "970",
    flag: "🇵🇸"
  },
  {
    iso2: "PA",
    name: "Panama",
    dialCode: "507",
    flag: "🇵🇦"
  },
  {
    iso2: "PG",
    name: "Papua New Guinea",
    dialCode: "675",
    flag: "🇵🇬"
  },
  {
    iso2: "PY",
    name: "Paraguay",
    dialCode: "595",
    flag: "🇵🇾"
  },
  {
    iso2: "PE",
    name: "Peru",
    dialCode: "51",
    flag: "🇵🇪"
  },
  {
    iso2: "PH",
    name: "Philippines",
    dialCode: "63",
    flag: "🇵🇭"
  },
  {
    iso2: "PL",
    name: "Poland",
    dialCode: "48",
    flag: "🇵🇱"
  },
  {
    iso2: "PT",
    name: "Portugal",
    dialCode: "351",
    flag: "🇵🇹"
  },
  {
    iso2: "PR",
    name: "Puerto Rico",
    dialCode: "1",
    flag: "🇵🇷"
  },
  {
    iso2: "QA",
    name: "Qatar",
    dialCode: "974",
    flag: "🇶🇦"
  },
  {
    iso2: "RE",
    name: "Réunion",
    dialCode: "262",
    flag: "🇷🇪"
  },
  {
    iso2: "RO",
    name: "Romania",
    dialCode: "40",
    flag: "🇷🇴"
  },
  {
    iso2: "RU",
    name: "Russia",
    dialCode: "7",
    flag: "🇷🇺"
  },
  {
    iso2: "RW",
    name: "Rwanda",
    dialCode: "250",
    flag: "🇷🇼"
  },
  {
    iso2: "WS",
    name: "Samoa",
    dialCode: "685",
    flag: "🇼🇸"
  },
  {
    iso2: "SM",
    name: "San Marino",
    dialCode: "378",
    flag: "🇸🇲"
  },
  {
    iso2: "ST",
    name: "São Tomé & Príncipe",
    dialCode: "239",
    flag: "🇸🇹"
  },
  {
    iso2: "SA",
    name: "Saudi Arabia",
    dialCode: "966",
    flag: "🇸🇦"
  },
  {
    iso2: "SN",
    name: "Senegal",
    dialCode: "221",
    flag: "🇸🇳"
  },
  {
    iso2: "RS",
    name: "Serbia",
    dialCode: "381",
    flag: "🇷🇸"
  },
  {
    iso2: "SC",
    name: "Seychelles",
    dialCode: "248",
    flag: "🇸🇨"
  },
  {
    iso2: "SL",
    name: "Sierra Leone",
    dialCode: "232",
    flag: "🇸🇱"
  },
  {
    iso2: "SG",
    name: "Singapore",
    dialCode: "65",
    flag: "🇸🇬"
  },
  {
    iso2: "SX",
    name: "Sint Maarten",
    dialCode: "1",
    flag: "🇸🇽"
  },
  {
    iso2: "SK",
    name: "Slovakia",
    dialCode: "421",
    flag: "🇸🇰"
  },
  {
    iso2: "SI",
    name: "Slovenia",
    dialCode: "386",
    flag: "🇸🇮"
  },
  {
    iso2: "SB",
    name: "Solomon Islands",
    dialCode: "677",
    flag: "🇸🇧"
  },
  {
    iso2: "SO",
    name: "Somalia",
    dialCode: "252",
    flag: "🇸🇴"
  },
  {
    iso2: "ZA",
    name: "South Africa",
    dialCode: "27",
    flag: "🇿🇦"
  },
  {
    iso2: "KR",
    name: "South Korea",
    dialCode: "82",
    flag: "🇰🇷"
  },
  {
    iso2: "SS",
    name: "South Sudan",
    dialCode: "211",
    flag: "🇸🇸"
  },
  {
    iso2: "ES",
    name: "Spain",
    dialCode: "34",
    flag: "🇪🇸"
  },
  {
    iso2: "LK",
    name: "Sri Lanka",
    dialCode: "94",
    flag: "🇱🇰"
  },
  {
    iso2: "BL",
    name: "St. Barthélemy",
    dialCode: "590",
    flag: "🇧🇱"
  },
  {
    iso2: "SH",
    name: "St. Helena",
    dialCode: "290",
    flag: "🇸🇭"
  },
  {
    iso2: "KN",
    name: "St. Kitts & Nevis",
    dialCode: "1",
    flag: "🇰🇳"
  },
  {
    iso2: "LC",
    name: "St. Lucia",
    dialCode: "1",
    flag: "🇱🇨"
  },
  {
    iso2: "MF",
    name: "St. Martin",
    dialCode: "590",
    flag: "🇲🇫"
  },
  {
    iso2: "PM",
    name: "St. Pierre & Miquelon",
    dialCode: "508",
    flag: "🇵🇲"
  },
  {
    iso2: "VC",
    name: "St. Vincent & Grenadines",
    dialCode: "1",
    flag: "🇻🇨"
  },
  {
    iso2: "SD",
    name: "Sudan",
    dialCode: "249",
    flag: "🇸🇩"
  },
  {
    iso2: "SR",
    name: "Suriname",
    dialCode: "597",
    flag: "🇸🇷"
  },
  {
    iso2: "SJ",
    name: "Svalbard & Jan Mayen",
    dialCode: "47",
    flag: "🇸🇯"
  },
  {
    iso2: "SE",
    name: "Sweden",
    dialCode: "46",
    flag: "🇸🇪"
  },
  {
    iso2: "CH",
    name: "Switzerland",
    dialCode: "41",
    flag: "🇨🇭"
  },
  {
    iso2: "SY",
    name: "Syria",
    dialCode: "963",
    flag: "🇸🇾"
  },
  {
    iso2: "TW",
    name: "Taiwan",
    dialCode: "886",
    flag: "🇹🇼"
  },
  {
    iso2: "TJ",
    name: "Tajikistan",
    dialCode: "992",
    flag: "🇹🇯"
  },
  {
    iso2: "TZ",
    name: "Tanzania",
    dialCode: "255",
    flag: "🇹🇿"
  },
  {
    iso2: "TH",
    name: "Thailand",
    dialCode: "66",
    flag: "🇹🇭"
  },
  {
    iso2: "TL",
    name: "Timor-Leste",
    dialCode: "670",
    flag: "🇹🇱"
  },
  {
    iso2: "TG",
    name: "Togo",
    dialCode: "228",
    flag: "🇹🇬"
  },
  {
    iso2: "TK",
    name: "Tokelau",
    dialCode: "690",
    flag: "🇹🇰"
  },
  {
    iso2: "TO",
    name: "Tonga",
    dialCode: "676",
    flag: "🇹🇴"
  },
  {
    iso2: "TT",
    name: "Trinidad & Tobago",
    dialCode: "1",
    flag: "🇹🇹"
  },
  {
    iso2: "TA",
    name: "Tristan da Cunha",
    dialCode: "290",
    flag: "🇹🇦"
  },
  {
    iso2: "TN",
    name: "Tunisia",
    dialCode: "216",
    flag: "🇹🇳"
  },
  {
    iso2: "TR",
    name: "Türkiye",
    dialCode: "90",
    flag: "🇹🇷"
  },
  {
    iso2: "TM",
    name: "Turkmenistan",
    dialCode: "993",
    flag: "🇹🇲"
  },
  {
    iso2: "TC",
    name: "Turks & Caicos Islands",
    dialCode: "1",
    flag: "🇹🇨"
  },
  {
    iso2: "TV",
    name: "Tuvalu",
    dialCode: "688",
    flag: "🇹🇻"
  },
  {
    iso2: "VI",
    name: "U.S. Virgin Islands",
    dialCode: "1",
    flag: "🇻🇮"
  },
  {
    iso2: "UG",
    name: "Uganda",
    dialCode: "256",
    flag: "🇺🇬"
  },
  {
    iso2: "UA",
    name: "Ukraine",
    dialCode: "380",
    flag: "🇺🇦"
  },
  {
    iso2: "AE",
    name: "United Arab Emirates",
    dialCode: "971",
    flag: "🇦🇪"
  },
  {
    iso2: "GB",
    name: "United Kingdom",
    dialCode: "44",
    flag: "🇬🇧"
  },
  {
    iso2: "US",
    name: "United States",
    dialCode: "1",
    flag: "🇺🇸"
  },
  {
    iso2: "UY",
    name: "Uruguay",
    dialCode: "598",
    flag: "🇺🇾"
  },
  {
    iso2: "UZ",
    name: "Uzbekistan",
    dialCode: "998",
    flag: "🇺🇿"
  },
  {
    iso2: "VU",
    name: "Vanuatu",
    dialCode: "678",
    flag: "🇻🇺"
  },
  {
    iso2: "VA",
    name: "Vatican City",
    dialCode: "39",
    flag: "🇻🇦"
  },
  {
    iso2: "VE",
    name: "Venezuela",
    dialCode: "58",
    flag: "🇻🇪"
  },
  {
    iso2: "VN",
    name: "Vietnam",
    dialCode: "84",
    flag: "🇻🇳"
  },
  {
    iso2: "WF",
    name: "Wallis & Futuna",
    dialCode: "681",
    flag: "🇼🇫"
  },
  {
    iso2: "EH",
    name: "Western Sahara",
    dialCode: "212",
    flag: "🇪🇭"
  },
  {
    iso2: "YE",
    name: "Yemen",
    dialCode: "967",
    flag: "🇾🇪"
  },
  {
    iso2: "ZM",
    name: "Zambia",
    dialCode: "260",
    flag: "🇿🇲"
  },
  {
    iso2: "ZW",
    name: "Zimbabwe",
    dialCode: "263",
    flag: "🇿🇼"
  }
]

export const DEFAULT_COUNTRY_ISO2 = 'IN'

export function findCountry(iso2: string): CountryDialCode | undefined {
  return ALL_COUNTRIES.find(c => c.iso2 === iso2.toUpperCase())
}

