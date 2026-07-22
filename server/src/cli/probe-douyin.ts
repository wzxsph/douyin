import { DouyinPublicProfileProbe } from '../sources/douyin-public-profile.js'
import { publicError } from '../domain/errors.js'

const inputUrl = process.argv.slice(2).find((argument) => argument !== '--')
if (!inputUrl) {
  console.error('Usage: pnpm probe:douyin -- <https://www.douyin.com/user/...>')
  process.exitCode = 2
} else {
  try {
    const result = await new DouyinPublicProfileProbe().probe(inputUrl)
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(JSON.stringify(publicError(error).body, null, 2))
    process.exitCode = 1
  }
}
