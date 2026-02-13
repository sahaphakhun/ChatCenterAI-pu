/*************************************************
 * config.js
 * - เก็บ Environment Variables และ Constants
 *************************************************/

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "XianTA1234";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const ASSETS_DIR = process.env.ASSETS_DIR; // optional custom assets directory (for volumes)

const GOOGLE_CLIENT_EMAIL = "aitar-888@eminent-wares-446512-j8.iam.gserviceaccount.com";
const GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDGhyeINArKZgaV\nitEcK+o89ilPYeRNTNZgJT7VNHB5hgNLLeAcFLJ7IlCIqTLMoJEnnoDQil6aKaz8\nExVL83uSXRrzk4zQvtt3tIP31+9wOCb9D4ZGWfVP1tD0qdD4WJ1qqg1j1/8879pH\nUeQGEMuCnyVbcQ3GbYQjyYb3wEz/Qv7kMVggF+MIaGGw2NQwM0XcufSFtyxvvX2S\nb8uGc1A8R+Dn/tmcgMODhbtEgcMg6yXI5Y26MPfDjVrEbk0lfCr7IGFJX4ASYeKl\n0jhm0RGb+aya2cb55auLN3VPO5MQ+cOp8gHBf5GiC/YgF1gbRgF5b7LgmENBxSfH\nb3WVQodLAgMBAAECggEACKB14M7LdekXZHyAQrZL0EitbzQknLv33Xyw2B3rvJ7M\nr4HM/nC4eBj7y+ciUc8GZQ+CWc2GzTHTa66+mwAia1qdYbPp3LuhGM4Leq5zn/o+\nA3rJuG6PS4qyUMy89msPXW5fSj/oE535QREiFKYP2dtlia2GI4xoag+x9uZwfMUO\nWKEe7tiUoZQEiGhwtjLq9lyST4kGGmlhNee9OyhDJcw4uCt8Cepr++hMDleWUF6c\nX0nbGmoSS0sZ5Boy8ATMhw/3luaOAlTUEz/nVDvbbWlNL9etwLKiAVw+AQXsPHNW\nNWF7gyEIsEi0qSM3PtA1X7IdReRXHqmfiZs0J3qSQQKBgQD1+Yj37Yuqj8hGi5PY\n+M0ieMdGcbUOmJsM1yUmBMV4bfaTiqm504P6DIYAqfDDWeozcHwcdpG1AfFAihEi\nh6lb0qRk8YaGbzvac8mWhwo/jDA5QB97fjFa6uwtlewZ0Er/U3QmOeVVnVC1y1b0\nrbJD5yjvI3ve+gpwAz0glpIMiwKBgQDOnpD7p7ylG4NQunqmzzdozrzZP0L6EZyE\n141st/Hsp9rtO9/ADuH6WhpirQ516l5LLv7mLPA8S9CF/cSdWF/7WlxBPjM8WRs9\nACFNBJIwUfjzPnvECmtsayzRlKuyCAspnNSkzgtdtvf2xI82Z3BGov9goZfu+D4A\n36b1qXsIQQKBgQCO1CojhO0vyjPKOuxL9hTvqmBUWFyBMD4AU8F/dQ/RYVDn1YG+\npMKi5Li/E+75EHH9EpkO0g7Do3AaQNG4UjwWVJcfAlxSHa8Mp2VsIdfilJ2/8KsX\nQ2yXVYh04/Rn/No/ro7oT4AKmcGu/nbstxuncEgFrH4WOOzspATPsn72BwKBgG5N\nBAT0NKbHm0B7bIKkWGYhB3vKY8zvnejk0WDaidHWge7nabkzuLtXYoKO9AtKxG/K\ndNUX5F+r8XO2V0HQLd0XDezecaejwgC8kwp0iD43ZHkmQBgVn+dPB6wSe94coSjj\nyjj4reSnipQ3tmRKsAtldIN3gI5YA3Gf85dtlHqBAoGAD5ePt7cmu3tDZhA3A8f9\no8mNPvqz/WGs7H2Qgjyfc3jUxEGhVt1Su7J1j+TppfkKtJIDKji6rVA9oIjZtpZT\ngxnU6hcYuiwbLh3wGEFIjP1XeYYILudqfWOEbwnxD1RgMkCqfSHf/niWlfiH6p3F\ndnBsLY/qXdKfS/OXyezAm4M=\n-----END PRIVATE KEY-----\n";
const GOOGLE_DOC_ID = "1QNyYrpa0ehJLxT-OPTlOh2HyTVGCOXxwg2MBWTs1M9A";
const SHEET_ID = process.env.SHEET_ID || "1uaOCSFvqr2FSzs3C4tg-gJd7HZInsWvlOZtE3psLeks";

module.exports = {
  PORT,
  MONGO_URI,
  PAGE_ACCESS_TOKEN,
  OPENAI_API_KEY,
  VERIFY_TOKEN,
  PUBLIC_BASE_URL,
  ASSETS_DIR,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_DOC_ID,
  SHEET_ID
};
