/**
 * Every historical requirement digest, frozen.
 *
 * The registry binds `<requirementId, version> -> requirementSha256`. Versions 1
 * and 2 name content that no longer exists anywhere in the tree: version 1
 * carried an asserted `ratification`, version 2 carried authored `sources` and
 * `provisions`. Nothing can recompute them, and that is the point — a signature
 * pinning `requirementVersion: 2` means whatever this table says it means, and
 * if a value here moves, every such signature silently changes its subject.
 *
 * **These literals were taken from committed history**, not from the working
 * registry and not by recomputing through the current producer. Recomputation
 * would be circular twice over: the producer's domain changed with the
 * migration, so it cannot reproduce a pre-migration digest, and an expected
 * value derived from the file under test agrees with any value that file holds.
 *
 * Source: `git show HEAD:backend/engine/verification/requirement-versions/csrd.json`
 * at `3803b0e`, which is the pre-Task-4 state — the corrective commit did not
 * touch the registry, and Task 4 only appends version 3.
 *
 * Recorded 2026-08-27, after a reviewer found the previous assertion pinned
 * seven of the sixteen version-2 values and none of the version-1 values.
 * Rewriting `CSRD-S-010`'s version-2 digest left all 1459 engine tests green.
 *
 * Entries are `[requirementId, version, digest]`.
 */
export const FROZEN_HISTORICAL_DIGESTS: readonly (readonly [string, string, string])[] = [
    ['CSRD-S-001', '1', 'c687f4c6cc56ab3699da6a860d56d52680517ef8697e5252f9de13342dbe402a'],
    ['CSRD-S-001', '2', 'fb5820d28690d5b6799bd8163e2651f68e347142243df396d87eccb93a3cd393'],
    ['CSRD-S-002', '1', '004072cf5439c8cd80e3ea2f0e8f57c445dea50dea4be95b495974fc1cab9e44'],
    ['CSRD-S-002', '2', 'd9c93c03c78391a7a8379af50be7ab5e08e887e640df481a22fe25b47fab3935'],
    ['CSRD-S-003', '1', 'ee35fb10192d57b99167052ce86e22808182815c1519fde0667ad2485b509b3b'],
    ['CSRD-S-003', '2', 'ef145a99b9fb42443ddcb108e7b01a7be768df45652eb66a03d4270a8c2a09b0'],
    ['CSRD-S-004', '1', '385e753ff00267e15b2485bf079cfcfad6eb58eb14f83d08d788ddca068754ed'],
    ['CSRD-S-004', '2', '4159ff13df770ebf581d77a1c9d926072d75be2bc965ac6db64e0a9fd7df15cd'],
    ['CSRD-S-005', '1', 'e2d09107d97acc2162dd6227957abc475fab82e4127b6697a461f8f76cf5735d'],
    ['CSRD-S-005', '2', '04acfca0371f1c123908d519c7b513a8f71faa179a7694e392494816fc3d4486'],
    ['CSRD-S-006', '1', '9ac8b07baa46b46fa500134d4893ab7adfa8e877c7ba9f296eb31a70a13fbdaa'],
    ['CSRD-S-006', '2', 'e7c079a7ffcb6f93f21fa0bdd0b8af8c1ea141d93c1dfdef7a1d4af6018b1950'],
    ['CSRD-S-007', '1', 'a9fd2df392f234ce4866302df204f9c08f6faf47b106d69249af1ad09d493479'],
    ['CSRD-S-007', '2', '15053eb0bb53c3e1d86389a076fca186cdbd2b1ce02011fb44919ea1659cf292'],
    ['CSRD-S-008', '1', 'e11e7b55778078bc955eb118d3bcb96fec33fde2b132f2f9602d207b6a040504'],
    ['CSRD-S-008', '2', '39c5c3eb08e839f096891cbe26b2e65a18656f1de8f84f91bf8f3572b615a901'],
    ['CSRD-S-009', '1', '5b2d514a8c7a9eded82d088a7669315cad358f24566c642e82fd2d46dce2ef24'],
    ['CSRD-S-009', '2', '5a395fc1ad76ca17cc8eefd2eea6dbdf5fd6c2bd24d80b1c4d782f8ec5d36e2c'],
    ['CSRD-S-010', '1', 'ace4c72d3a5173a6e669663e26399a47447540abb29879b37037ca6b8570809c'],
    ['CSRD-S-010', '2', 'ceb05a9f9d59591c8336bac6c7e10e87eab43da6758fdf037cc4061a89e48b35'],
    ['CSRD-S-011', '1', '482af6f42419f6c702ef4ff6a09273fc43e3280480c5ccfcf746a2d9abd08085'],
    ['CSRD-S-011', '2', 'cd453ffd825c7dce19b6da9d3359fec2706539157010346e824421c5539f29ca'],
    ['CSRD-S-012', '1', '84a6840b86641f139f3fa51cf0f1c51cd8eea3fc4c47b4d2125eeabe95a92474'],
    ['CSRD-S-012', '2', '3c8a2614d10dc085e68837e75b472625bad6cd4ae4a3c6d9971bb3d73f693b44'],
    ['CSRD-S-013', '1', '7cc3ed4cd923c86484381dc3084db4577bc34cefeab9465dd4414f3ef8ad5329'],
    ['CSRD-S-013', '2', 'cae8a5bc5e645f77850ad4edf8feb47a955f25a277736c6819cc695d2a1e0231'],
    ['CSRD-S-014', '1', '3ce4f490bf5f96fafebfdaf76bd6a343b3908a35826657a7ee51cd294bec7004'],
    ['CSRD-S-014', '2', '254c52427df46f0108d45e6840b694d2ed7c7730e6f5d78a089f593daaa4a6fa'],
    ['CSRD-S-015', '1', '272cadc1d5e0531cc79f2396f0fd221b997dec8eb36deecd51f0cbbcfa7d28a9'],
    ['CSRD-S-015', '2', '82cf3afdc2869a136dedccb2ebb017afa979371453f3d69dea427ae0fdcc2185'],
    ['CSRD-S-016', '1', '5aaff179405449e22fada750d129c020e9ac0e43b1897407979bde1d008479ac'],
    ['CSRD-S-016', '2', '2684972679479ab80b0928f65b34ea355c23f582a03844b8b62ea7f48fd119c3'],];
