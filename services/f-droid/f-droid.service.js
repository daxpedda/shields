'use strict'

const Joi = require('joi')
const BaseYamlService = require('../base-yaml')
const { addv: versionText } = require('../../lib/text-formatters')
const { version: versionColor } = require('../../lib/color-formatters')
const { InvalidResponse } = require('../errors')

const schema = Joi.object({
  CurrentVersion: Joi.alternatives()
    .try(Joi.number(), Joi.string())
    .required(),
}).required()

module.exports = class FDroid extends BaseYamlService {
  static render({ version }) {
    return {
      message: versionText(version),
      color: versionColor(version),
    }
  }

  async handle({ appId }, queryParams) {
    const constructor = this.constructor
    const { metadata_format: format } = constructor.validateParams(queryParams)
    const url = `https://gitlab.com/fdroid/fdroiddata/raw/master/metadata/${appId}`
    const fetchOpts = {
      options: {},
      errorMessages: {
        404: 'app not found',
      },
    }
    const fetch = format === 'yml' ? this.fetchYaml : this.fetchText
    let result

    try {
      // currently, we only use the txt format to the initial fetch because
      // there are more apps with that format but yml is now the standard format
      // on f-droid, so if txt is not found we look for yml as the fallback
      result = await fetch.call(this, url, fetchOpts)
    } catch (error) {
      if (format) {
        // if the format was specified it doesn't make the fallback request
        throw error
      }
      result = await this.fetchYaml(url, fetchOpts)
    }

    return constructor.render(result)
  }

  async fetchYaml(url, options) {
    const yaml = await this._requestYaml({
      schema,
      url: `${url}.yml`,
      ...options,
    })
    return { version: yaml['CurrentVersion'] }
  }

  async fetchText(url, options) {
    const { buffer } = await this._request({
      url: `${url}.txt`,
      ...options,
    })
    const metadata = buffer.toString()
    // we assume the layout as provided here:
    // https://gitlab.com/fdroid/fdroiddata/raw/master/metadata/axp.tool.apkextractor.txt
    const positionOfCurrentVersionAtEndOfTheFile = metadata.lastIndexOf(
      'Current Version:'
    ) // credits: https://stackoverflow.com/a/11134049
    const lastVersion = metadata.substring(
      positionOfCurrentVersionAtEndOfTheFile
    )

    const match = lastVersion.match(/^Current Version:\s*(.*?)\s*$/m)
    if (!match) {
      throw new InvalidResponse({
        prettyMessage: 'invalid response',
        underlyingError: new Error('could not find version on website'),
      })
    }
    return { version: match[1] }
  }

  static validateParams(queryParams) {
    const queryParamsSchema = Joi.object({
      metadata_format: Joi.string().valid(['yml', 'txt']),
    }).required()

    return this._validateQueryParams(queryParams, queryParamsSchema)
  }

  // Metadata
  static get defaultBadgeData() {
    return { label: 'f-droid' }
  }

  static get category() {
    return 'version'
  }

  static get route() {
    return {
      base: 'f-droid/v',
      format: '(.+)',
      capture: ['appId'],
      queryParams: ['metadata_format'],
    }
  }

  static get examples() {
    return [
      {
        title: 'F-Droid',
        exampleUrl: 'org.thosp.yourlocalweather',
        pattern: ':appId',
        staticExample: this.render({ version: '1.0' }),
        keywords: ['fdroid', 'android', 'app'],
      },
      {
        title: 'F-Droid (explicit metadata format)',
        exampleUrl: 'org.dystopia.email',
        pattern: ':appId',
        queryParams: { metadata_format: 'yml' },
        staticExample: this.render({ version: '1.2.1' }),
        keywords: ['fdroid', 'android', 'app'],
      },
    ]
  }
}
